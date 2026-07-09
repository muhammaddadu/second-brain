/**
 * The renderer↔main contract — one home for IPC channel names and the typed vault API the preload
 * bridge exposes on `window.vault`. The renderer imports only *types* from here and from
 * @brain/core (erased at build), never `fs` or core itself: all vault I/O happens in the main
 * process (AGENTS.md architecture rule; app-architecture.md boundary rules).
 */
import type {
  DiscoveredProvider,
  EmbeddingSettings,
  NoteEnvelope,
  ProviderKind,
  SearchHit,
  TestResult,
  TreeNode,
  VaultEventType,
} from '@brain/core';

export const IPC = {
  startup: 'app:startup',
  appearance: 'app:appearance',
  appearanceChanged: 'app:appearance-changed',
  createVault: 'app:create-vault',
  pickVault: 'app:pick-vault',
  openRecent: 'app:open-recent',
  recentVaults: 'app:recent-vaults',
  getSettings: 'app:get-settings',
  setSettings: 'app:set-settings',
  /** Main → renderer push: navigate to a route (deep link / CLI open-to-page). */
  navigate: 'app:navigate',
  vaultInfo: 'vault:info',
  vaultTree: 'vault:tree',
  readNote: 'vault:read-note',
  saveBlocks: 'vault:save-blocks',
  setTags: 'vault:set-tags',
  setTitle: 'vault:set-title',
  newNote: 'vault:new-note',
  newFolder: 'vault:new-folder',
  rename: 'vault:rename',
  move: 'vault:move',
  trash: 'vault:trash',
  renameFolder: 'vault:rename-folder',
  moveFolder: 'vault:move-folder',
  trashFolder: 'vault:trash-folder',
  setOrder: 'vault:set-order',
  search: 'vault:search',
  // Embeddings / semantic-search provider management (ADR 0008).
  scanProviders: 'embed:scan-providers',
  listModels: 'embed:list-models',
  testProvider: 'embed:test-provider',
  setEmbeddingSecret: 'embed:set-secret',
  hasEmbeddingSecret: 'embed:has-secret',
  secretStorageAvailable: 'embed:secret-storage-available',
  rebuildIndex: 'embed:rebuild-index',
  clearSemanticIndex: 'embed:clear-semantic',
  indexStats: 'embed:index-stats',
  pauseIndexing: 'embed:pause-indexing',
  /** Main → renderer push: a file changed in the vault (watcher). */
  changed: 'vault:changed',
  /** Main → renderer push: indexing status (idle / indexing progress). */
  indexStatus: 'vault:index-status',
} as const;

/** Summary of the open vault, for the window header. */
export interface VaultInfo {
  name: string;
  root: string;
}

/**
 * OS-driven appearance the renderer adapts to. `theme` tracks `nativeTheme` live; `translucent` is
 * true only when a real OS effect is active (macOS vibrancy / Windows Mica) and the user hasn't
 * asked for reduced transparency; `platform` drives title-bar/drag layout.
 */
export interface Appearance {
  theme: 'light' | 'dark';
  translucent: boolean;
  platform: 'darwin' | 'win32' | 'linux';
}

/** A previously-used vault, shown on the welcome screen. */
export interface RecentVault {
  name: string;
  path: string;
}

/** User preferences (persisted; the seam for more settings over time). */
export interface Settings {
  /** Follow the OS, or force light/dark. */
  theme: 'system' | 'light' | 'dark';
  /** Turn off window translucency (vibrancy/Mica) regardless of platform. */
  reduceTransparency: boolean;
  /** Semantic-search embedding provider config (default off = keyword only, no network — ADR 0008). */
  embedding: EmbeddingSettings;
}

/** Secret fields a provider may need; stored encrypted via the OS keychain, never in the vault. */
export interface ProviderSecretInput {
  apiKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}

/** Indexing status pushed to the renderer so the UI can show progress (idle when done). */
export interface IndexStatus {
  state: 'idle' | 'indexing';
  done: number;
  total: number;
}

/** Snapshot of the index for the settings screen. */
export interface IndexStats {
  notes: number;
  chunks: number;
  embedded: number;
  /** The embedding model currently configured (null when semantic search is off). */
  model: string | null;
  paused: boolean;
}

/**
 * What the app should show at launch. `ready` — a vault is open (BRAIN_VAULT was set); go straight
 * in. `setup` — show the welcome screen: create a fresh vault at `suggestedPath`, open an existing
 * folder, or reopen one of `recent`.
 */
export type StartupState =
  | { mode: 'ready'; info: VaultInfo; route?: string }
  | { mode: 'setup'; recent: RecentVault[]; suggestedPath: string };

/** A note plus the content hash it was read at — the baseline for the conflict guard. */
export interface ReadNoteResult {
  note: NoteEnvelope;
  hash: string;
}

/** Result of a guarded save: the new hash, or a conflict (the file changed on disk). */
export type SaveResult = { status: 'saved'; hash: string } | { status: 'conflict' };

/** Result of a tag edit: the persisted tags and the note's new content hash. */
export interface SetTagsResult {
  tags: string[];
  hash: string;
}

/** Result of a title edit: the note's (possibly renamed) path and the applied title. */
export interface SetTitleResult {
  path: string;
  title: string;
}

/** A watcher change pushed to the renderer; `hash` is present for note add/change events. */
export interface VaultChangePayload {
  type: VaultEventType;
  path: string;
  hash?: string;
}

/** The surface exposed to the renderer as `window.vault`. Thin — each call forwards to core. */
export interface VaultApi {
  /** What to show at launch (ready vs. first-run setup). */
  startup(): Promise<StartupState>;
  /** Current OS appearance (theme, translucency, platform). */
  appearance(): Promise<Appearance>;
  /** Subscribe to live appearance changes (system light/dark, transparency). Returns unsubscribe. */
  onAppearanceChange(listener: (appearance: Appearance) => void): () => void;
  /** Create and open a fresh vault at the suggested path; returns the opened vault. */
  createVault(): Promise<VaultInfo>;
  /** Open a folder chosen via the OS picker as a vault; null if the user cancels. */
  pickVault(): Promise<VaultInfo | null>;
  /** Reopen a previously-used vault by path; null if it's no longer a valid vault. */
  openRecent(path: string): Promise<VaultInfo | null>;
  /** Validated recent vaults (for the in-app switcher), most-recent first. */
  recentVaults(): Promise<RecentVault[]>;
  /** Current user preferences. */
  getSettings(): Promise<Settings>;
  /** Merge and persist preferences; applies immediately. Returns the full settings. */
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Subscribe to navigation pushed from main (deep links / CLI open-to-page). Returns unsubscribe. */
  onNavigate(listener: (routeUrl: string) => void): () => void;
  info(): Promise<VaultInfo>;
  tree(): Promise<TreeNode[]>;
  readNote(path: string): Promise<ReadNoteResult>;
  /** Save blocks only if the file still matches `baseHash`; otherwise reports a conflict. */
  saveBlocks(path: string, blocks: unknown[], baseHash: string): Promise<SaveResult>;
  setTags(path: string, tags: string[]): Promise<SetTagsResult>;
  /** Set the note's title and rename its file to match; returns the (possibly new) path. */
  setTitle(path: string, title: string): Promise<SetTitleResult>;
  /** Create a new note in `folder` (vault-relative, '' for root); returns the created path. */
  newNote(folder: string): Promise<string>;
  /** Create a new folder under `parent` (vault-relative, '' for root); returns the created path. */
  newFolder(parent: string): Promise<string>;
  /** Rename a note in place; `newName` includes the extension. Returns the new path. */
  rename(path: string, newName: string): Promise<string>;
  /** Move a note to a new vault-relative path. */
  move(fromPath: string, toPath: string): Promise<void>;
  /** Delete a note to trash (recoverable). */
  trash(path: string): Promise<void>;
  /** Rename a folder in place; returns the new folder path. */
  renameFolder(path: string, newName: string): Promise<string>;
  /** Move a folder (and contents) to a new vault-relative path. */
  moveFolder(fromPath: string, toPath: string): Promise<void>;
  /** Delete a folder (and contents) to trash (recoverable). */
  trashFolder(path: string): Promise<void>;
  /**
   * Persist a folder's manual child order (ADR 0005). `folder` is '' for the vault root;
   * `orderedNames` are on-disk entry names (a folder's dir name, a note's `.note.json` filename).
   */
  setOrder(folder: string, orderedNames: string[]): Promise<void>;
  /** Search the vault (keyword, plus semantic when a provider is configured); ranked, with snippets. */
  search(query: string, limit?: number): Promise<SearchHit[]>;
  /** Subscribe to vault change events; returns an unsubscribe function. */
  onVaultChange(listener: (change: VaultChangePayload) => void): () => void;
  /** Subscribe to indexing status (progress of the embedding pass); returns an unsubscribe function. */
  onIndexStatus(listener: (status: IndexStatus) => void): () => void;

  // --- Embeddings / semantic-search provider management (ADR 0008) ---
  /** Probe local runtimes (Ollama, LM Studio) and report which are running + their models. */
  scanProviders(): Promise<DiscoveredProvider[]>;
  /** List embedding models a provider offers (uses its saved config + secret); [] if it can't. */
  listModels(kind: ProviderKind): Promise<string[]>;
  /** Test the currently-configured provider end-to-end; plain-language result. */
  testProvider(): Promise<TestResult>;
  /** Encrypt and store a provider's secret in the OS keychain (never written to the vault). */
  setEmbeddingSecret(kind: ProviderKind, secret: ProviderSecretInput): Promise<void>;
  /** Whether a secret is stored for a provider (without revealing it). */
  hasEmbeddingSecret(kind: ProviderKind): Promise<boolean>;
  /** Whether the OS keychain is available for storing secrets. */
  secretStorageAvailable(): Promise<boolean>;
  /** Rebuild the whole index from files (keyword + re-embed) — proves it's derived. */
  rebuildIndex(): Promise<void>;
  /** Drop all vectors (keeps keyword search); used before a model change or to reclaim space. */
  clearSemanticIndex(): Promise<void>;
  /** Current index counts + model + paused state, for the settings screen. */
  indexStats(): Promise<IndexStats>;
  /** Pause or resume the (network) embedding pass. */
  pauseIndexing(paused: boolean): Promise<void>;
}
