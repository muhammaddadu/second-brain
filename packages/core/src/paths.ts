/**
 * Vault path conventions — one home for every reserved name and extension.
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
