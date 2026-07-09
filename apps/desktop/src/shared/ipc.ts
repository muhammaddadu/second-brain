/**
 * The renderer↔main contract — one home for IPC channel names and the typed vault API the preload
 * bridge exposes on `window.vault`. The renderer imports only *types* from here and from
 * @brain/core (erased at build), never `fs` or core itself: all vault I/O happens in the main
 * process (AGENTS.md architecture rule; app-architecture.md boundary rules).
 */
import type { NoteEnvelope, TreeNode, VaultEventType } from '@brain/core';

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
  newNote: 'vault:new-note',
  newFolder: 'vault:new-folder',
  rename: 'vault:rename',
  move: 'vault:move',
  trash: 'vault:trash',
  /** Main → renderer push: a file changed in the vault (watcher). */
  changed: 'vault:changed',
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
  /** Subscribe to vault change events; returns an unsubscribe function. */
  onVaultChange(listener: (change: VaultChangePayload) => void): () => void;
}
