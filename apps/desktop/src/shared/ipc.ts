/**
 * The renderer↔main contract — one home for IPC channel names and the typed vault API the preload
 * bridge exposes on `window.vault`. The renderer imports only *types* from here and from
 * @brain/core (erased at build), never `fs` or core itself: all vault I/O happens in the main
 * process (AGENTS.md architecture rule; app-architecture.md boundary rules).
 */
import type {
  DatabaseRow,
  DatabaseSchema,
  DiscoveredProvider,
  EmbeddingSettings,
  GraphData,
  ImportResult,
  NoteEnvelope,
  NoteRef,
  PropertyType,
  ProviderKind,
  ProviderSecrets,
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
  importFiles: 'vault:import-files',
  search: 'vault:search',
  graph: 'vault:graph',
  resolveLink: 'vault:resolve-link',
  backlinks: 'vault:backlinks',
  noteRefs: 'vault:note-refs',
  createNoteFromLink: 'vault:create-from-link',
  // Databases (E8, ADR 0004).
  getDatabase: 'db:get',
  createDatabase: 'db:create',
  addProperty: 'db:add-property',
  setRowProperty: 'db:set-row-property',
  listRows: 'db:list-rows',
  listDatabases: 'db:list',
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
  builtinModelReady: 'embed:builtin-ready',
  downloadBuiltinModel: 'embed:builtin-download',
  agentSkillStatus: 'agent:skill-status',
  installAgentSkill: 'agent:skill-install',
  removeAgentSkill: 'agent:skill-remove',
  cliStatus: 'agent:cli-status',
  installCli: 'agent:cli-install',
  addCliToPath: 'agent:cli-add-path',
  removeCli: 'agent:cli-remove',
  getRules: 'agent:get-rules',
  setRules: 'agent:set-rules',
  /** Main → renderer push: a file changed in the vault (watcher). */
  changed: 'vault:changed',
  /** Main → renderer push: indexing status (idle / indexing progress). */
  indexStatus: 'vault:index-status',
  /** Main → renderer push: auto-update status (available / downloaded-ready). */
  updateStatus: 'app:update-status',
  checkForUpdates: 'app:check-updates',
  installUpdate: 'app:install-update',
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

/**
 * Secret fields a provider may need; stored encrypted via the OS keychain, never in the vault.
 * Same contract as core's {@link ProviderSecrets} — aliased so it can't drift.
 */
export type ProviderSecretInput = ProviderSecrets;

/**
 * Indexing status pushed to the renderer for progress. `downloading` = fetching the built-in
 * on-device model (done/total are a 0–100 percent); `indexing` = embedding chunks (done/total count).
 */
export interface IndexStatus {
  state: 'idle' | 'indexing' | 'downloading';
  done: number;
  total: number;
}

/** Auto-update status pushed to the renderer. `ready` means a version is downloaded and a restart applies it. */
export interface UpdateStatus {
  state: 'idle' | 'available' | 'ready';
  version?: string;
}

/** Install state of the vault contract for one agent runtime (Claude Code, Codex CLI, …). */
export interface AgentSkillStatus {
  id: string;
  name: string;
  installed: boolean;
  outdated: boolean;
  /** Absolute path of the installed file (shown so the owner knows where it lives). */
  path: string;
}

/** Install state of the global `brain` command. */
export interface CliStatus {
  installed: boolean;
  /** True when the installed wrapper doesn't match the current app/CLI paths. */
  outdated: boolean;
  /** Where the command is (or would be) installed. */
  path: string;
  /** Whether that directory is on the user's PATH (live PATH, or already set in their shell profile). */
  onPath: boolean;
  /** The shell profile we'd configure to add it to PATH (absent on Windows). */
  shellProfile?: string;
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
  newFolder(parent: string, base?: string): Promise<string>;
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
  /** Import dropped files into `folder` ('' = root), converting each to a note; per-file results. */
  importFiles(
    folder: string,
    files: Array<{ name: string; data: Uint8Array }>,
  ): Promise<ImportResult[]>;
  /** Search the vault (keyword, plus semantic when a provider is configured); ranked, with snippets. */
  search(query: string, limit?: number): Promise<SearchHit[]>;
  /** The knowledge graph derived from the index — notes as nodes, tag + semantic + link edges. */
  graph(threshold?: number): Promise<GraphData>;
  /** Resolve a wikilink target to a vault note path (path, then unique title), or null. */
  resolveLink(target: string): Promise<string | null>;
  /** Notes that link to `path` (its backlinks), with titles. */
  backlinks(path: string): Promise<NoteRef[]>;
  /** All notes as {path, title} — for client-side wikilink resolution and the [[ picker. */
  noteRefs(): Promise<NoteRef[]>;
  /** Create a note at a wikilink target (e.g. "People/Robert Kohler"); returns the created path. */
  createNoteFromLink(target: string): Promise<string>;

  // --- Databases (E8, ADR 0004) ---
  /** A folder's database schema, or null when the folder isn't a database. */
  getDatabase(folder: string): Promise<DatabaseSchema | null>;
  /** Turn a folder into a database (writes a default schema; idempotent). */
  createDatabase(folder: string): Promise<DatabaseSchema>;
  /** Add a typed property; returns the updated schema. */
  addProperty(
    folder: string,
    name: string,
    type: PropertyType,
    options?: string[],
  ): Promise<DatabaseSchema>;
  /** Set (or clear with null) one property value on a row note. */
  setRowProperty(folder: string, path: string, propertyId: string, value: unknown): Promise<void>;
  /** The database's rows (folder notes with title + property values). */
  listRows(folder: string): Promise<DatabaseRow[]>;
  /** Every database folder in the vault (for tree badges). */
  listDatabases(): Promise<string[]>;
  /** Subscribe to vault change events; returns an unsubscribe function. */
  onVaultChange(listener: (change: VaultChangePayload) => void): () => void;
  /** Subscribe to indexing status (progress of the embedding pass); returns an unsubscribe function. */
  onIndexStatus(listener: (status: IndexStatus) => void): () => void;
  /** Subscribe to auto-update status (a newer version downloaded and ready to install). */
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
  /** Manually check for an update (e.g. from the app menu). */
  checkForUpdates(): Promise<void>;
  /** Restart and install a downloaded update. */
  installUpdate(): Promise<void>;

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
  /** Whether the built-in on-device model is already downloaded (so we can prompt before fetching). */
  builtinModelReady(): Promise<boolean>;
  /** Download + warm up the built-in on-device model (progress via onIndexStatus), then index. */
  downloadBuiltinModel(): Promise<void>;

  // --- Global agent skill (ADR 0009) ---
  /** Install state of the vault contract per agent runtime (Claude Code, Codex, Gemini, …). */
  agentSkillStatus(): Promise<AgentSkillStatus[]>;
  /** Install (or update) the vault contract for one runtime by target id. */
  installAgentSkill(id: string): Promise<void>;
  /** Remove the vault contract for one runtime by target id. */
  removeAgentSkill(id: string): Promise<void>;
  /** Install state of the global `brain` command. */
  cliStatus(): Promise<CliStatus>;
  /** Install (or update) the global `brain` command into the user's bin directory. */
  installCli(): Promise<void>;
  /** Make `brain` available in the Terminal by adding its folder to the shell profile's PATH. */
  addCliToPath(): Promise<{ shellProfile: string }>;
  /** Remove the global `brain` command. */
  removeCli(): Promise<void>;
  /** The owner's agent rules (RULES.md), or '' if none. */
  getRules(): Promise<string>;
  /** Save the owner's agent rules (RULES.md); a blank value removes the file. */
  setRules(text: string): Promise<void>;
}
