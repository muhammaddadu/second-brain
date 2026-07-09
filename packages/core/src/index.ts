/** Public surface of @brain/core — the only entry point shells import. */

export {
  AGENT_GUIDE_VERSION,
  agentGuideBody,
  renderAgentGuide,
  syncAgentGuide,
} from './agent-guide.js';
export { atomicWriteFile } from './atomic.js';
export {
  BUILTIN_EMBEDDING_MODEL,
  cosineSimilarity,
  createEmbeddingAdapter,
  DEFAULT_EMBEDDING_SETTINGS,
  type DiscoveredProvider,
  type EmbeddingAdapter,
  type EmbeddingProvider,
  type EmbeddingSettings,
  fuseRankings,
  type ProviderConfig,
  type ProviderKind,
  type ProviderSecrets,
  scanLocalProviders,
  type TestResult,
} from './embeddings.js';
export { BEDROCK_EMBEDDING_MODELS } from './embeddings-bedrock.js';
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
export {
  AGENT_GUIDE_FILE,
  BRAIN_DIR,
  INDEX_DB,
  NOTE_EXTENSION,
  ORDER_FILE,
  RULES_FILE,
  TRASH_DIRNAME,
  VAULT_MARKER_FILE,
} from './paths.js';
export {
  blocksToText,
  buildMatchQuery,
  chunkText,
  type EmbedProgress,
  embedPending,
  hybridSearch,
  type IndexEntry,
  indexPath,
  openSearchIndex,
  rebuildIndex,
  reindexNote,
  type SearchHit,
  type SearchIndex,
  syncIndex,
} from './search.js';
export { entryName, listTree, type TreeNode, type TreeNodeType } from './tree.js';
export {
  type Clock,
  type CreateNoteInput,
  createFolder,
  createNote,
  emptyTrash,
  hashNote,
  initVault,
  isVault,
  moveFolder,
  moveNote,
  openVault,
  readNote,
  renameFolder,
  renameNote,
  setFolderOrder,
  trashFolder,
  trashNote,
  updateNoteBlocks,
  updateNoteBlocksGuarded,
  updateNoteTags,
  updateNoteTitle,
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
