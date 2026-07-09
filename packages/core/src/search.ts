/**
 * Derived search index (E4) — a single-file SQLite database (`.brain/index.db`) providing full-text
 * (FTS5) retrieval over note text, in `packages/core` so the app, CLI, and MCP query one
 * implementation. The index is *entirely derived* from the note files (ADR 0002 files-first): it can
 * be deleted and rebuilt to reproduce equivalent results, and never holds a fact the files don't.
 * The engine is WASM SQLite (`node-sqlite3-wasm`, ADR 0006) — no native build, portable to a future
 * cloud sync server. Semantic (vector) retrieval rides on the same DB in a later slice.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { parseNote } from './envelope.js';
import { BRAIN_DIR, INDEX_DB, NOTE_EXTENSION } from './paths.js';
import { listTree, type TreeNode } from './tree.js';
import type { Vault } from './vault.js';

// node-sqlite3-wasm is CommonJS and its ambient .d.ts doesn't export cleanly under NodeNext ESM;
// require it and type the exact surface we use (avoids interop guesswork and documents the contract).
interface SqliteRunResult {
  lastInsertRowid: number | bigint;
}
interface SqliteDatabase {
  exec(sql: string): void;
  run(sql: string, values?: unknown[]): SqliteRunResult;
  all(sql: string, values?: unknown[]): Array<Record<string, unknown>>;
  get(sql: string, values?: unknown[]): Record<string, unknown> | null;
  close(): void;
}
interface Sqlite3Module {
  Database: new (filename?: string) => SqliteDatabase;
}
const require = createRequire(import.meta.url);

/** Longest chunk we index; longer note text is split on line boundaries into pieces this size. */
const MAX_CHUNK_CHARS = 1000;

/**
 * Markers FTS5 wraps around matched terms in a snippet. Private-use-area code points, so they never
 * collide with literal brackets/text in a note (unlike `[`/`]`). The renderer splits on these exact
 * characters to highlight — see `SNIPPET_OPEN`/`SNIPPET_CLOSE` in apps/desktop SearchPalette.tsx.
 */
const SNIPPET_OPEN = '\uE000';
const SNIPPET_CLOSE = '\uE001';

/** Upper bound on matching chunk rows scanned per query before de-duping to distinct notes. Far
 * above any sane result `limit`, so distinct-note count is not truncated, while bounding memory. */
const SCAN_CAP = 1000;

/** One search result: the note, a highlighted snippet, and a relevance score (higher = better). */
export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

/** What the index needs to (re)index one note. */
export interface IndexEntry {
  path: string;
  title: string;
  tags: string[];
  hash: string;
  text: string;
}

/** The derived index handle. All methods are synchronous (WASM SQLite); construct via {@link openSearchIndex}. */
export interface SearchIndex {
  /** Replace a note's index entries (removes any prior ones for the path first). */
  upsert(entry: IndexEntry): void;
  /** Drop a note's index entries (for a delete/move-away). */
  remove(path: string): void;
  /** The content hash last indexed for a path, or null if unindexed — drives incremental reindex. */
  storedHash(path: string): string | null;
  /** All indexed note paths (for pruning entries whose files are gone). */
  indexedPaths(): string[];
  /** Empty the whole index (used before a full rebuild). */
  clear(): void;
  /** Keyword search: distinct notes ranked best-first, each with a snippet. */
  search(query: string, limit?: number): SearchHit[];
  /** Whether the underlying database is still open (false after {@link SearchIndex.close}). */
  isOpen(): boolean;
  close(): void;
}

/** Recursively pull plain text out of a BlockNote document — no jsdom, so it runs in the main process. */
export function blocksToText(blocks: unknown): string {
  const lines: string[] = [];
  const visitInline = (content: unknown): string => {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) {
      // Table content: { rows: [{ cells: InlineContent[][] }] }.
      if (content && typeof content === 'object' && 'rows' in content) {
        const rows = (content as { rows?: unknown }).rows;
        if (Array.isArray(rows)) {
          return rows
            .map((r) =>
              r && typeof r === 'object' && Array.isArray((r as { cells?: unknown }).cells)
                ? (r as { cells: unknown[] }).cells.map(visitInline).join(' ')
                : '',
            )
            .join(' ');
        }
      }
      return '';
    }
    return content
      .map((node) => {
        if (!node || typeof node !== 'object') return '';
        const n = node as { text?: unknown; content?: unknown };
        if (typeof n.text === 'string') return n.text;
        if (n.content !== undefined) return visitInline(n.content);
        return '';
      })
      .join('');
  };
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      if (!block || typeof block !== 'object') continue;
      const b = block as { content?: unknown; children?: unknown };
      const text = visitInline(b.content).trim();
      if (text) lines.push(text);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return lines.join('\n');
}

/** Split note text into retrieval chunks of at most {@link MAX_CHUNK_CHARS}, on line/word boundaries. */
export function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const rawLine of trimmed.split('\n')) {
    // Hard-split a single line longer than the limit on word boundaries.
    let line = rawLine;
    while (line.length > MAX_CHUNK_CHARS) {
      const slice = line.slice(0, MAX_CHUNK_CHARS);
      const cut = slice.lastIndexOf(' ');
      const head = cut > 0 ? slice.slice(0, cut) : slice;
      flush();
      chunks.push(head.trim());
      line = line.slice(head.length);
    }
    if (current.length + line.length + 1 > MAX_CHUNK_CHARS) flush();
    current += (current ? '\n' : '') + line;
  }
  flush();
  return chunks;
}

/** Turn a user query into an FTS5 MATCH expression: prefix-match each word, ANDed. Null if empty. */
export function buildMatchQuery(query: string): string | null {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return null;
  // Tokens are alphanumeric only, so they carry no FTS5 operators — safe to append the prefix `*`.
  return tokens.map((t) => `${t}*`).join(' ');
}

/** Display title for a note: its metadata title, else the filename without the note extension. */
function titleFor(path: string, metaTitle: unknown): string {
  if (typeof metaTitle === 'string' && metaTitle.trim()) return metaTitle;
  const base = basename(path);
  return base.endsWith(NOTE_EXTENSION) ? base.slice(0, -NOTE_EXTENSION.length) : base;
}

/** Open (creating if needed) the derived index for a vault's `.brain/index.db`. */
export function openSearchIndex(dbPath: string): SearchIndex {
  const { Database } = require('node-sqlite3-wasm') as Sqlite3Module;
  const db = new Database(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (path TEXT PRIMARY KEY, title TEXT, tags TEXT, hash TEXT);
    CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY, path TEXT, pos INTEGER, text TEXT);
    CREATE INDEX IF NOT EXISTS chunks_by_path ON chunks (path);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text);
  `);

  // Guard every operation on `open`: a vault switch / HMR reload can close this index while an
  // in-flight syncIndex is mid-loop (awaiting a file read). Rather than throw "Database already
  // closed", closed-index operations become safe no-ops — the superseding index owns the work.
  let open = true;

  function remove(path: string): void {
    if (!open) return;
    db.run('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE path = ?)', [path]);
    db.run('DELETE FROM chunks WHERE path = ?', [path]);
    db.run('DELETE FROM notes WHERE path = ?', [path]);
  }

  return {
    upsert(entry: IndexEntry): void {
      if (!open) return;
      remove(entry.path);
      db.run('INSERT INTO notes (path, title, tags, hash) VALUES (?, ?, ?, ?)', [
        entry.path,
        entry.title,
        entry.tags.join(' '),
        entry.hash,
      ]);
      const chunks = chunkText(entry.text);
      chunks.forEach((text, pos) => {
        const { lastInsertRowid } = db.run(
          'INSERT INTO chunks (path, pos, text) VALUES (?, ?, ?)',
          [entry.path, pos, text],
        );
        db.run('INSERT INTO chunks_fts (rowid, text) VALUES (?, ?)', [lastInsertRowid, text]);
      });
    },
    remove,
    storedHash(path: string): string | null {
      if (!open) return null;
      const row = db.get('SELECT hash FROM notes WHERE path = ?', [path]);
      return row && typeof row.hash === 'string' ? row.hash : null;
    },
    indexedPaths(): string[] {
      if (!open) return [];
      return db
        .all('SELECT path FROM notes')
        .map((r) => r.path)
        .filter((p): p is string => typeof p === 'string');
    },
    clear(): void {
      if (!open) return;
      db.exec('DELETE FROM chunks_fts; DELETE FROM chunks; DELETE FROM notes;');
    },
    search(query: string, limit = 20): SearchHit[] {
      if (!open) return [];
      const match = buildMatchQuery(query);
      if (!match) return [];
      // FTS5 aux functions (bm25/snippet) need the live match cursor, so they can't be used through
      // a GROUP BY / aggregate. Instead scan matching chunks best-first and de-dupe to distinct notes
      // in JS, keeping each note's best (first) chunk. SCAN_CAP bounds memory on very common terms
      // while staying far above `limit`, so we still surface `limit` distinct notes.
      const rows = db.all(
        `SELECT c.path AS path, n.title AS title,
                snippet(chunks_fts, 0, ?, ?, '…', 12) AS snippet,
                bm25(chunks_fts) AS rank
         FROM chunks_fts
         JOIN chunks c ON c.id = chunks_fts.rowid
         JOIN notes n ON n.path = c.path
         WHERE chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
        [SNIPPET_OPEN, SNIPPET_CLOSE, match, SCAN_CAP],
      );
      const seen = new Set<string>();
      const hits: SearchHit[] = [];
      for (const row of rows) {
        const path = typeof row.path === 'string' ? row.path : '';
        if (!path || seen.has(path)) continue;
        seen.add(path);
        hits.push({
          path,
          title: typeof row.title === 'string' ? row.title : titleFor(path, undefined),
          snippet: typeof row.snippet === 'string' ? row.snippet : '',
          // bm25 is negative (lower = better); flip so higher = more relevant for callers.
          score: -(typeof row.rank === 'number' ? row.rank : 0),
        });
        if (hits.length >= limit) break;
      }
      return hits;
    },
    isOpen(): boolean {
      return open;
    },
    close(): void {
      if (!open) return;
      open = false;
      db.close();
    },
  };
}

/** Absolute path to a vault's derived index file. */
export function indexPath(vault: Vault): string {
  return join(vault.root, BRAIN_DIR, INDEX_DB);
}

/**
 * (Re)index one note if its bytes changed since last indexed. Returns true if it (re)indexed, false
 * if the stored hash already matched (incremental skip). A missing/unreadable file is removed.
 */
export async function reindexNote(
  vault: Vault,
  index: SearchIndex,
  relPath: string,
): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(join(vault.root, relPath), 'utf8');
  } catch {
    index.remove(relPath);
    return false;
  }
  const hash = createHash('sha256').update(raw).digest('hex');
  if (index.storedHash(relPath) === hash) return false;
  const note = parseNote(raw);
  index.upsert({
    path: relPath,
    title: titleFor(relPath, note.meta.title),
    tags: Array.isArray(note.meta.tags) ? note.meta.tags.filter((t) => typeof t === 'string') : [],
    hash,
    text: blocksToText(note.blocks),
  });
  return true;
}

/** Every note path in the vault tree, depth-first. */
async function collectNotePaths(vault: Vault): Promise<string[]> {
  const paths: string[] = [];
  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'note') paths.push(node.path);
      else if (node.children) collect(node.children);
    }
  };
  collect(await listTree(vault.root));
  return paths;
}

/** Reindex one note, swallowing (logging) a single bad note so it can't abort a whole-vault pass. */
async function reindexSafely(vault: Vault, index: SearchIndex, relPath: string): Promise<void> {
  try {
    await reindexNote(vault, index, relPath);
  } catch (error) {
    // A malformed/corrupt note file must not leave the rest of the vault unsearchable.
    console.error(`failed to index ${relPath}:`, error);
  }
}

/** Fully rebuild the index from the note files — proves the index is derived (delete + rebuild). */
export async function rebuildIndex(vault: Vault, index: SearchIndex): Promise<void> {
  index.clear();
  for (const path of await collectNotePaths(vault)) {
    await reindexSafely(vault, index, path);
  }
}

/**
 * Bring the index in line with the files without a full rebuild: (re)index changed notes (the hash
 * gate skips unchanged ones, so this is cheap on reopen) and drop entries whose files are gone. This
 * is the on-open sync; {@link rebuildIndex} is the from-scratch path.
 *
 * The sync yields between notes, so a vault switch / HMR reload may close this index (and open a
 * newer one) mid-loop; it stops as soon as the index is closed, leaving the work to the newer index.
 */
export async function syncIndex(vault: Vault, index: SearchIndex): Promise<void> {
  const present = new Set(await collectNotePaths(vault));
  for (const path of present) {
    if (!index.isOpen()) return;
    await reindexSafely(vault, index, path);
  }
  if (!index.isOpen()) return;
  for (const path of index.indexedPaths()) {
    if (!present.has(path)) index.remove(path);
  }
}
