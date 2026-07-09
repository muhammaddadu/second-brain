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
  NoteExistsError,
  NoteParseError,
  VaultError,
} from './errors.js';
export { BRAIN_DIR, INDEX_DB, NOTE_EXTENSION, RULES_FILE, TRASH_DIRNAME } from './paths.js';
export { listTree, type TreeNode, type TreeNodeType } from './tree.js';
export {
  type Clock,
  type CreateNoteInput,
  createNote,
  emptyTrash,
  moveNote,
  openVault,
  readNote,
  renameNote,
  trashNote,
  type Vault,
  type VaultOptions,
  writeNote,
} from './vault.js';
