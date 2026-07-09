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

/** Owner-defined agent rules — plain Markdown at the vault root (deliberate exception to the note format). */
export const RULES_FILE = 'RULES.md';
