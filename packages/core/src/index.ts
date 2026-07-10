/**
 * Public surface of @brain/core — the only entry point shells import. Internal helpers stay out
 * (tests import module files directly). The renderer value-imports pure constants/helpers via the
 * side-effect-free `@brain/core/paths` subexport instead of this barrel (which pulls in fs/sqlite).
 */

export {
  AGENT_GUIDE_VERSION,
  agentGuideBody,
  renderAgentGuide,
  syncAgentGuide,
} from './agent-guide.js';
export {
  addProperty,
  createDatabase,
  type DatabaseRow,
  type DatabaseSchema,
  type DatabaseViewDef,
  listDatabases,
  listRows,
  PROPERTY_TYPES,
  type PropertyDef,
  type PropertyType,
  readDatabase,
  renameProperty,
  setRowProperty,
  validateValue,
  writeDatabase,
} from './database.js';
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
  LMSTUDIO_BASE_URL,
  OLLAMA_BASE_URL,
  PROVIDER_KINDS,
  type ProviderConfig,
  type ProviderKind,
  type ProviderSecrets,
  scanLocalProviders,
  type TestResult,
} from './embeddings.js';
export { BEDROCK_EMBEDDING_MODELS } from './embeddings-bedrock.js';
export { embeddingAdapterFromEnv } from './embeddings-env.js';
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
  buildGraph,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type GraphOptions,
} from './graph.js';
export {
  exportNoteToMarkdown,
  exportVaultToMarkdown,
  importMarkdownAsNote,
} from './import-export.js';
export { IMPORTABLE_EXTENSIONS, type ImportResult, importFileAsNote } from './import-file.js';
export {
  collectVaultLinks,
  getBacklinks,
  type VaultLink,
  type VaultLinks,
} from './links.js';
export { blocksToMarkdown, markdownToBlocks } from './markdown.js';
export {
  AGENT_GUIDE_FILE,
  BRAIN_DIR,
  DATABASE_FILE,
  entryName,
  INDEX_DB,
  NOTE_EXTENSION,
  noteDisplayName,
  noteTitle,
  ORDER_FILE,
  RULES_FILE,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  TRASH_DIRNAME,
  VAULT_MARKER_FILE,
} from './paths.js';
export {
  blocksToText,
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
export {
  analyzeSpreadsheet,
  type ImportAnalysis,
  type ImportProgress,
  importSpreadsheetAsDatabase,
  isSpreadsheet,
  MAX_DATABASE_ROWS,
  type Sheet,
  type SheetPlan,
  type SpreadsheetImportResult,
} from './spreadsheet.js';
export { listTree, type TreeNode, type TreeNodeType } from './tree.js';
export {
  type Clock,
  type CreateNoteInput,
  createFolder,
  createFolderWithUniqueName,
  createNote,
  createNoteWithUniqueName,
  emptyTrash,
  hashNote,
  initVault,
  isVault,
  moveFolder,
  moveNote,
  openVault,
  readNote,
  readRules,
  renameFolder,
  renameNote,
  restoreFromTrash,
  setFolderOrder,
  setNoteTitle,
  titleToFilenameBase,
  trashFolder,
  trashNote,
  updateNoteBlocks,
  updateNoteBlocksGuarded,
  updateNoteTags,
  updateNoteTitle,
  type Vault,
  type VaultOptions,
  writeNote,
  writeRules,
} from './vault.js';
export {
  type VaultChange,
  type VaultEventType,
  type VaultWatcher,
  watchVault,
} from './watcher.js';
export {
  type NoteRef,
  parseWikilinks,
  resolveWikilink,
  type WikiLink,
  wikilinkTargets,
} from './wikilinks.js';
