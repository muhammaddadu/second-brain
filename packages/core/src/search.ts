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
import { join } from 'node:path';
import {
  cosineSimilarity,
  decodeVector,
  type EmbeddingProvider,
  encodeVector,
  fuseRankings,
} from './embeddings.js';
import { parseNote } from './envelope.js';
import { BRAIN_DIR, INDEX_DB, noteTitle, SNIPPET_CLOSE, SNIPPET_OPEN } from './paths.js';
import { collectNotePaths, listTree } from './tree.js';
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

/** Upper bound on matching chunk rows scanned per query before de-duping to distinct notes. Far
 * above any sane result `limit`, so distinct-note count is not truncated, while bounding memory. */
const SCAN_CAP = 1000;

/** One search result: the note, a highlighted snippet, and a relevance score (higher = better). */
export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  /** How the note matched — set by {@link hybridSearch} so UIs can show that semantics contributed. */
  matched?: 'keyword' | 'semantic' | 'both';
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
  /** Run `fn` inside one SQLite transaction — batches many writes into a single commit (fast bulk index). */
  transaction(fn: () => Promise<void>): Promise<void>;
  /** Keyword search: distinct notes ranked best-first, each with a snippet. */
  search(query: string, limit?: number): SearchHit[];
  /** Chunks with no embedding for `model` yet (the work list for {@link embedPending}). */
  pendingChunks(model: string, limit: number): Array<{ id: number; text: string }>;
  /** How many chunks still need an embedding for `model` (for progress). */
  pendingCount(model: string): number;
  /** Store one chunk's vector for `model`. */
  setEmbedding(chunkId: number, model: string, vec: number[]): void;
  /** Semantic search: distinct notes ranked by cosine similarity to `queryVec` for `model`. */
  semanticHits(queryVec: number[], model: string, limit?: number): SearchHit[];
  /** All indexed notes with their tags — the nodes of the knowledge graph. */
  graphNotes(): Array<{ path: string; title: string; tags: string[] }>;
  /** One vector per note (mean of its chunk vectors) for `model` — for semantic graph edges. */
  noteVectors(model: string): Array<{ path: string; vec: number[] }>;
  /** Drop all vectors (keeps keyword index) — for "clear semantic index" / a model change. */
  clearEmbeddings(): void;
  /** Counts for the UI: indexed notes, total chunks, and how many chunks have an embedding. */
  stats(): { notes: number; chunks: number; embedded: number };
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

/** Keep each note's best (first) hit from a ranked list, up to `limit` distinct notes. */
function dedupeByPath(ranked: SearchHit[], limit: number): SearchHit[] {
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const hit of ranked) {
    if (!hit.path || seen.has(hit.path)) continue;
    seen.add(hit.path);
    hits.push(hit);
    if (hits.length >= limit) break;
  }
  return hits;
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
    CREATE TABLE IF NOT EXISTS embeddings (chunk_id INTEGER PRIMARY KEY, model TEXT, vec BLOB);
  `);

  // Guard every operation on `open`: a vault switch / HMR reload can close this index while an
  // in-flight syncIndex is mid-loop (awaiting a file read). Rather than throw "Database already
  // closed", closed-index operations become safe no-ops — the superseding index owns the work.
  let open = true;

  function remove(path: string): void {
    if (!open) return;
    db.run('DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE path = ?)', [
      path,
    ]);
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
    async transaction(fn: () => Promise<void>): Promise<void> {
      if (!open) return;
      db.exec('BEGIN');
      try {
        await fn();
        if (open) db.exec('COMMIT'); // a mid-run close() aborts the txn; nothing to commit
      } catch (error) {
        if (open) db.exec('ROLLBACK');
        throw error;
      }
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
      const candidates: SearchHit[] = rows.map((row) => {
        const path = typeof row.path === 'string' ? row.path : '';
        return {
          path,
          title: typeof row.title === 'string' ? row.title : noteTitle(path, undefined),
          snippet: typeof row.snippet === 'string' ? row.snippet : '',
          // bm25 is negative (lower = better); flip so higher = more relevant for callers.
          score: -(typeof row.rank === 'number' ? row.rank : 0),
        };
      });
      return dedupeByPath(candidates, limit);
    },
    pendingChunks(model: string, limit: number): Array<{ id: number; text: string }> {
      if (!open) return [];
      return db
        .all(
          `SELECT c.id AS id, c.text AS text FROM chunks c
           LEFT JOIN embeddings e ON e.chunk_id = c.id AND e.model = ?
           WHERE e.chunk_id IS NULL
           LIMIT ?`,
          [model, limit],
        )
        .map((r) => ({ id: Number(r.id), text: typeof r.text === 'string' ? r.text : '' }));
    },
    pendingCount(model: string): number {
      if (!open) return 0;
      const row = db.get(
        `SELECT count(*) AS n FROM chunks c
         LEFT JOIN embeddings e ON e.chunk_id = c.id AND e.model = ?
         WHERE e.chunk_id IS NULL`,
        [model],
      );
      return row && typeof row.n === 'number' ? row.n : 0;
    },
    setEmbedding(chunkId: number, model: string, vec: number[]): void {
      if (!open) return;
      db.run('INSERT OR REPLACE INTO embeddings (chunk_id, model, vec) VALUES (?, ?, ?)', [
        chunkId,
        model,
        encodeVector(vec),
      ]);
    },
    semanticHits(queryVec: number[], model: string, limit = 20): SearchHit[] {
      if (!open) return [];
      const rows = db.all(
        `SELECT c.path AS path, n.title AS title, c.text AS text, e.vec AS vec
         FROM embeddings e
         JOIN chunks c ON c.id = e.chunk_id
         JOIN notes n ON n.path = c.path
         WHERE e.model = ?`,
        [model],
      );
      const scored = rows
        .map((row) => {
          const vec = row.vec instanceof Uint8Array ? decodeVector(row.vec) : null;
          return {
            path: typeof row.path === 'string' ? row.path : '',
            title: typeof row.title === 'string' ? row.title : '',
            text: typeof row.text === 'string' ? row.text : '',
            score: vec ? cosineSimilarity(queryVec, vec) : 0,
          };
        })
        .filter((s) => s.path)
        .sort((a, b) => b.score - a.score)
        .map((s) => ({
          path: s.path,
          title: s.title || noteTitle(s.path, undefined),
          snippet: s.text.slice(0, 160),
          score: s.score,
        }));
      return dedupeByPath(scored, limit);
    },
    graphNotes(): Array<{ path: string; title: string; tags: string[] }> {
      if (!open) return [];
      return db.all('SELECT path, title, tags FROM notes').map((r) => ({
        path: typeof r.path === 'string' ? r.path : '',
        title: typeof r.title === 'string' ? r.title : '',
        tags: typeof r.tags === 'string' && r.tags ? r.tags.split(' ').filter(Boolean) : [],
      }));
    },
    noteVectors(model: string): Array<{ path: string; vec: number[] }> {
      if (!open) return [];
      const rows = db.all(
        `SELECT c.path AS path, e.vec AS vec
         FROM embeddings e JOIN chunks c ON c.id = e.chunk_id
         WHERE e.model = ?`,
        [model],
      );
      // Average each note's chunk vectors into one note-level vector.
      const sums = new Map<string, { sum: number[]; count: number }>();
      for (const row of rows) {
        const path = typeof row.path === 'string' ? row.path : '';
        if (!path || !(row.vec instanceof Uint8Array)) continue;
        const vec = decodeVector(row.vec);
        const acc = sums.get(path);
        if (!acc) {
          sums.set(path, { sum: [...vec], count: 1 });
        } else {
          for (let i = 0; i < vec.length; i += 1) acc.sum[i] = (acc.sum[i] ?? 0) + (vec[i] ?? 0);
          acc.count += 1;
        }
      }
      return [...sums.entries()].map(([path, { sum, count }]) => ({
        path,
        vec: sum.map((v) => v / count),
      }));
    },
    clearEmbeddings(): void {
      if (!open) return;
      db.exec('DELETE FROM embeddings;');
    },
    stats(): { notes: number; chunks: number; embedded: number } {
      if (!open) return { notes: 0, chunks: 0, embedded: 0 };
      const num = (sql: string): number => {
        const row = db.get(sql);
        return row && typeof row.n === 'number' ? row.n : 0;
      };
      return {
        notes: num('SELECT count(*) AS n FROM notes'),
        chunks: num('SELECT count(*) AS n FROM chunks'),
        embedded: num('SELECT count(*) AS n FROM embeddings'),
      };
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
    title: noteTitle(relPath, note.meta.title),
    tags: Array.isArray(note.meta.tags) ? note.meta.tags.filter((t) => typeof t === 'string') : [],
    hash,
    text: blocksToText(note.blocks),
  });
  return true;
}

/** Every note path in the vault, depth-first (the shared tree walk). */
async function vaultNotePaths(vault: Vault): Promise<string[]> {
  return collectNotePaths(await listTree(vault.root));
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
  const paths = await vaultNotePaths(vault);
  // One transaction for the whole rebuild — turns thousands of auto-commits into a single commit.
  await index.transaction(async () => {
    for (const path of paths) {
      await reindexSafely(vault, index, path);
    }
  });
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
  const present = new Set(await vaultNotePaths(vault));
  // Batch the (re)index writes into one transaction — cheap when unchanged (hash gate skips), fast
  // when a large vault is indexed for the first time. Bails if the index is closed (vault switch).
  await index.transaction(async () => {
    for (const path of present) {
      if (!index.isOpen()) return;
      await reindexSafely(vault, index, path);
    }
  });
  if (!index.isOpen()) return;
  for (const path of index.indexedPaths()) {
    if (!present.has(path)) index.remove(path);
  }
}

/** Progress of the (async, network) embedding pass. */
export interface EmbedProgress {
  done: number;
  total: number;
}

/** Chunks embedded per provider round-trip during {@link embedPending}. */
const EMBED_PAGE = 64;

/**
 * Compute and store embeddings for every chunk still missing one for the provider's model (ADR
 * 0007). This is the slow, network-bound half of indexing — it reports progress and stops if the
 * index is closed (vault switch). Throws if the provider fails, so the caller can surface it.
 */
export async function embedPending(
  index: SearchIndex,
  provider: EmbeddingProvider,
  onProgress?: (p: EmbedProgress) => void,
  shouldContinue?: () => boolean,
): Promise<void> {
  const total = index.pendingCount(provider.model);
  if (total === 0) {
    onProgress?.({ done: 0, total: 0 });
    return;
  }
  let done = 0;
  while (index.isOpen() && (shouldContinue?.() ?? true)) {
    const batch = index.pendingChunks(provider.model, EMBED_PAGE);
    if (batch.length === 0) break;
    const vectors = await provider.embed(batch.map((c) => c.text));
    if (!index.isOpen()) return;
    let stored = 0;
    batch.forEach((chunk, i) => {
      const vec = vectors[i];
      if (vec) {
        index.setEmbedding(chunk.id, provider.model, vec);
        stored += 1;
      }
    });
    // Guard against a misbehaving provider that returns no usable vectors — don't spin forever.
    if (stored === 0) break;
    done += stored;
    onProgress?.({ done: Math.min(done, total), total });
  }
  onProgress?.({ done: total, total });
}

/**
 * Search combining keyword (FTS) and, when a provider is configured, semantic (vector) retrieval,
 * fused by Reciprocal Rank Fusion. Falls back to keyword-only if there's no provider or the query
 * embedding fails — search never hard-fails because embeddings are down. The keyword snippet (with
 * highlight markers) is preferred when a note appears in both legs.
 */
export async function hybridSearch(
  index: SearchIndex,
  query: string,
  provider: EmbeddingProvider | null,
  limit = 20,
): Promise<SearchHit[]> {
  const keyword = index.search(query, limit).map((h) => ({ ...h, matched: 'keyword' as const }));
  if (!provider) return keyword;
  let semantic: SearchHit[] = [];
  try {
    const [queryVec] = await provider.embed([query]);
    if (queryVec) semantic = index.semanticHits(queryVec, provider.model, limit);
  } catch (error) {
    console.error('semantic search failed; falling back to keyword only', error);
    return keyword;
  }
  if (semantic.length === 0) return keyword;
  const order = fuseRankings(
    keyword.map((h) => h.path),
    semantic.map((h) => h.path),
  );
  const byPath = new Map<string, SearchHit>();
  for (const hit of semantic) byPath.set(hit.path, { ...hit, matched: 'semantic' });
  for (const hit of keyword) {
    // Keyword wins the snippet (it carries highlights); record when semantics also found the note.
    byPath.set(hit.path, { ...hit, matched: byPath.has(hit.path) ? 'both' : 'keyword' });
  }
  return order
    .slice(0, limit)
    .map((path) => byPath.get(path))
    .filter((hit): hit is SearchHit => hit !== undefined);
}
