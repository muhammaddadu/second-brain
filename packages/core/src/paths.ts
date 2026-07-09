/**
 * Vault path & naming conventions — one home for every reserved name, extension, marker character,
 * and the pure helpers that apply them. Deliberately **side-effect free with no Node imports** so
 * the desktop renderer can value-import it via the `@brain/core/paths` subexport (the main core
 * barrel pulls in fs/sqlite and is type-only from the renderer).
 * See docs/architecture/data-model.md § "The vault".
 */

/** Every note file ends with this. A file that doesn't is not a note. */
export const NOTE_EXTENSION = '.note.json';

/** Reserved directory at the vault root holding derived/app internals; never part of the note tree. */
export const BRAIN_DIR = '.brain';

/** Soft-deleted notes live here, under {@link BRAIN_DIR}. */
export const TRASH_DIRNAME = 'trash';

/** Derived SQLite index, under {@link BRAIN_DIR}. Safe to delete; rebuildable. */
export const INDEX_DB = 'index.db';

/** Marker file (under {@link BRAIN_DIR}) that identifies a directory as a Second Brain vault. */
export const VAULT_MARKER_FILE = 'vault.json';

/** Owner-defined agent rules — plain Markdown at the vault root (deliberate exception to the note format). */
export const RULES_FILE = 'RULES.md';

/** App-maintained guide telling an AI agent how to work with this vault directly (plain Markdown at the root). */
export const AGENT_GUIDE_FILE = 'AGENTS.md';

/**
 * Per-folder manual-order sidecar (a JSON array of child entry names in display order). Lives inside
 * the folder it orders so the order travels with the content on move/copy. Advisory: missing or
 * partial → unlisted children fall back to the default folders-first, alphabetical sort.
 * See docs/adr/0005-manual-ordering-per-folder-sidecar.md and docs/architecture/data-model.md.
 */
export const ORDER_FILE = '.order.json';

/**
 * Database descriptor: a folder containing this file is a database — its notes are rows, the file
 * holds the typed property schema and saved views (ADR 0004). Documented in data-model § Databases.
 */
export const DATABASE_FILE = 'database.json';

/**
 * Markers FTS5 wraps around matched terms in a search snippet. Private-use-area code points, so
 * they never collide with literal text in a note (unlike `[`/`]`). The renderer highlights runs
 * between them; the CLI strips them. One contract, defined here only.
 */
export const SNIPPET_OPEN = '\uE000';
export const SNIPPET_CLOSE = '\uE001';

/** The on-disk entry name used as an order key: the dir name for a folder, the filename for a note. */
export function entryName(node: { name: string; type: 'folder' | 'note' }): string {
  return node.type === 'folder' ? node.name : `${node.name}${NOTE_EXTENSION}`;
}

/** A note's display name from its path: the filename without {@link NOTE_EXTENSION}. */
export function noteDisplayName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.endsWith(NOTE_EXTENSION) ? base.slice(0, -NOTE_EXTENSION.length) : base;
}

/** A note's display title: its metadata title when set, else {@link noteDisplayName}. */
export function noteTitle(path: string, metaTitle: unknown): string {
  if (typeof metaTitle === 'string' && metaTitle.trim()) return metaTitle;
  return noteDisplayName(path);
}
