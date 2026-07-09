/** Public surface of @brain/core — the only entry point shells import. */

export { atomicWriteFile } from './atomic.js';
export {
  CURRENT_ENVELOPE_VERSION,
  getTags,
  type NoteEnvelope,
  type NoteMeta,
  parseNote,
  serializeNote,
  setTags,
} from './envelope.js';
export {
  InvalidPathError,
  NoteConflictError,
  NoteExistsError,
  NoteParseError,
  VaultError,
} from './errors.js';
export {
  exportNoteToMarkdown,
  exportVaultToMarkdown,
  importMarkdownAsNote,
} from './import-export.js';
export { blocksToMarkdown, markdownToBlocks } from './markdown.js';
export { BRAIN_DIR, INDEX_DB, NOTE_EXTENSION, RULES_FILE, TRASH_DIRNAME } from './paths.js';
export { listTree, type TreeNode, type TreeNodeType } from './tree.js';
export {
  type Clock,
  type CreateNoteInput,
  createFolder,
  createNote,
  emptyTrash,
  hashNote,
  moveNote,
  openVault,
  readNote,
  renameNote,
  trashNote,
  updateNoteBlocks,
  updateNoteBlocksGuarded,
  updateNoteTags,
  type Vault,
  type VaultOptions,
  writeNote,
} from './vault.js';
export {
  isReservedPath,
  toVaultRelative,
  type VaultChange,
  type VaultEventType,
  type VaultWatcher,
  watchVault,
} from './watcher.js';
