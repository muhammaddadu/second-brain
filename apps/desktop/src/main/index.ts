/**
 * Electron main process: the only place vault I/O runs. Owns the app lifecycle (which vault is
 * open, first-run setup) and answers the renderer's IPC by forwarding to @brain/core. The renderer
 * never touches the filesystem — it talks only through the preload bridge (app-architecture.md).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  createFolder,
  createNote,
  DEFAULT_EMBEDDING_SETTINGS,
  type EmbeddingSettings,
  hashNote,
  indexPath,
  initVault,
  isVault,
  listTree,
  moveFolder,
  moveNote,
  NOTE_EXTENSION,
  NoteConflictError,
  NoteExistsError,
  openSearchIndex,
  openVault,
  type ProviderKind,
  readNote,
  reindexNote,
  renameFolder,
  renameNote,
  type SearchIndex,
  setFolderOrder,
  trashFolder,
  trashNote,
  updateNoteBlocksGuarded,
  updateNoteTags,
  updateNoteTitle,
  type Vault,
  type VaultWatcher,
  watchVault,
} from '@brain/core';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, safeStorage } from 'electron';
import {
  type Appearance,
  type IndexStats,
  type IndexStatus,
  IPC,
  type ProviderSecretInput,
  type ReadNoteResult,
  type RecentVault,
  type SaveResult,
  type SetTagsResult,
  type SetTitleResult,
  type Settings,
  type StartupState,
  type VaultChangePayload,
  type VaultInfo,
} from '../shared/ipc.js';
import { APP_SCHEME } from '../shared/route.js';
import { createEmbeddingService } from './embedding-service.js';

const MAX_RECENT = 8;
// No spaces in the folder name (shell/path-friendly); the display name stays "Second Brain".
const DEFAULT_VAULT_NAME = 'SecondBrain';
const APP_NAME = 'Second Brain';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Set the app name before anything reads it, so the macOS menu/About/Quit say "Second Brain",
// not "Electron" (windows-menu-and-app-name.md). productName fixes packaged builds.
app.setName(APP_NAME);

let currentVault: Vault | null = null;
let watcher: VaultWatcher | null = null;
let searchIndex: SearchIndex | null = null;

/** Push indexing status to every window so the UI can show progress. */
function pushIndexStatus(status: IndexStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.indexStatus, status);
  }
}

// --- Config (remembered vaults) ---------------------------------------------

interface Config {
  recent: string[];
  settings: Settings;
  /** Per-provider-kind encrypted secret blobs (base64). Never sent to the renderer or the vault. */
  secrets: Record<string, string>;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  reduceTransparency: false,
  embedding: DEFAULT_EMBEDDING_SETTINGS,
};

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

/**
 * Upgrade a persisted `embedding` value to the ADR-0008 shape. The ADR-0007 flat form
 * (`{ provider, baseUrl, model, apiKey }`) maps to a provider kind + per-kind config; any old apiKey
 * is dropped (the owner re-enters it, now stored in the keychain) rather than left in plaintext.
 */
function migrateEmbedding(raw: unknown): EmbeddingSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_EMBEDDING_SETTINGS;
  if ('enabled' in raw && 'configs' in raw) return raw as EmbeddingSettings; // already ADR-0008
  const old = raw as { provider?: string; baseUrl?: string; model?: string };
  const kind: ProviderKind = (old.baseUrl ?? '').includes('11434') ? 'ollama' : 'openai-compatible';
  const migrated: EmbeddingSettings = structuredClone(DEFAULT_EMBEDDING_SETTINGS);
  migrated.enabled = old.provider === 'openai-compatible';
  migrated.kind = kind;
  if (old.baseUrl || old.model) {
    migrated.configs[kind] = {
      kind,
      baseUrl: old.baseUrl ?? migrated.configs[kind]?.baseUrl ?? '',
      model: old.model ?? '',
    };
  }
  return migrated;
}

function readConfig(): Config {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<Config> & {
      vaultPath?: unknown;
    };
    const recent = Array.isArray(raw.recent) ? raw.recent.filter((p) => typeof p === 'string') : [];
    // Migrate the old single-path format.
    if (typeof raw.vaultPath === 'string' && !recent.includes(raw.vaultPath)) {
      recent.unshift(raw.vaultPath);
    }
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) };
    settings.embedding = migrateEmbedding(
      (raw.settings as { embedding?: unknown } | undefined)?.embedding,
    );
    const secrets =
      raw.secrets && typeof raw.secrets === 'object' ? (raw.secrets as Record<string, string>) : {};
    return { recent, settings, secrets };
  } catch {
    return { recent: [], settings: DEFAULT_SETTINGS, secrets: {} };
  }
}

// --- Embedding provider secrets (OS keychain via safeStorage; ADR 0008) ------
// Persistence lives here (config is this module's concern); the embedding *service* is injected
// these accessors so its provider/indexing logic stays in one cohesive module.

function secretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Decrypt a provider's stored secret, or `{}` if none / the keychain is unavailable. */
function readSecret(kind: ProviderKind): ProviderSecretInput {
  const enc = readConfig().secrets[kind];
  if (!enc || !safeStorage.isEncryptionAvailable()) return {};
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(enc, 'base64'))) as ProviderSecretInput;
  } catch {
    return {};
  }
}

/** Encrypt and persist a provider's secret; a blank secret clears it. */
function writeSecret(kind: ProviderKind, input: ProviderSecretInput): void {
  const config = readConfig();
  const hasAny = Object.values(input).some((v) => typeof v === 'string' && v.trim());
  if (!hasAny) {
    delete config.secrets[kind];
  } else if (safeStorage.isEncryptionAvailable()) {
    config.secrets[kind] = safeStorage.encryptString(JSON.stringify(input)).toString('base64');
  }
  writeConfig(config);
}

/** The embedding/semantic-search service — owns provider state + indexing; see ./embedding-service. */
const embeddings = createEmbeddingService({
  getIndex: () => searchIndex,
  getSettings: readSettings,
  readSecret,
  pushStatus: pushIndexStatus,
  builtinCacheDir: join(app.getPath('userData'), 'models'),
});

function writeConfig(config: Config): void {
  try {
    writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch {
    // Non-fatal: we just won't persist across launches.
  }
}

function rememberVault(vaultPath: string): void {
  const config = readConfig();
  config.recent = [vaultPath, ...config.recent.filter((p) => p !== vaultPath)].slice(0, MAX_RECENT);
  writeConfig(config);
}

function readSettings(): Settings {
  return readConfig().settings;
}

function saveSettings(patch: Partial<Settings>): Settings {
  const config = readConfig();
  config.settings = { ...config.settings, ...patch };
  writeConfig(config);
  return config.settings;
}

// --- Vault activation --------------------------------------------------------

function vaultName(vaultPath: string): string {
  return vaultPath.split(/[\\/]/).filter(Boolean).pop() ?? vaultPath;
}

function infoOf(vault: Vault): VaultInfo {
  return { name: vaultName(vault.root), root: vault.root };
}

/**
 * The default location for a brand-new vault, de-duplicated so we never reuse a folder. We use the
 * home directory rather than ~/Documents on purpose: Documents (and Desktop) are commonly synced by
 * iCloud Drive, whose sync daemon fights our atomic writes/watcher, can evict files to `.icloud`
 * placeholders, and would sync the SQLite index + WAL (risking corruption). Home root is not synced
 * by default. The owner can still choose any folder via "Open an existing folder…".
 */
function suggestedNewVaultPath(): string {
  const base = process.env.BRAIN_HOME ?? app.getPath('home');
  let candidate = join(base, DEFAULT_VAULT_NAME);
  for (let n = 2; existsSync(candidate); n += 1) {
    candidate = join(base, `${DEFAULT_VAULT_NAME} ${n}`);
  }
  return candidate;
}

/** Open (creating/marking as needed) a vault, (re)start its watcher, and remember it. */
async function activateVault(vaultPath: string): Promise<VaultInfo> {
  await initVault(vaultPath);
  const vault = openVault(vaultPath);
  currentVault = vault;
  if (watcher) {
    await watcher.close();
  }
  // The derived search index (E4): open it, then bring it in line with the files incrementally
  // (cheap on reopen — the hash gate skips unchanged notes). It stays live via the watcher below.
  searchIndex?.close();
  const index = openSearchIndex(indexPath(vault));
  searchIndex = index;
  void (async () => {
    await embeddings.refresh();
    await embeddings.syncAndEmbed(vault, index); // keyword sync (fast) then embeddings (if configured)
  })().catch((error) => console.error('index sync failed', error));
  watcher = watchVault(vault, async (change) => {
    let hash: string | undefined;
    // Bind reindex to the index opened for *this* vault (captured), not the module-level handle: a
    // vault switch reassigns `searchIndex`, and an in-flight callback must never write this vault's
    // note into a different vault's index. The old index is closed on switch → its writes no-op.
    if (change.path.endsWith(NOTE_EXTENSION)) {
      if (change.type === 'unlink') {
        index.remove(change.path);
      } else {
        try {
          hash = await hashNote(vault, change.path);
          await reindexNote(vault, index, change.path);
          void embeddings.runPass(); // embed the note's new chunks (if a provider is set)
        } catch {
          // File may have vanished between event and read; leave hash undefined.
        }
      }
    }
    const payload: VaultChangePayload = {
      type: change.type,
      path: change.path,
      ...(hash ? { hash } : {}),
    };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.changed, payload);
    }
  });
  rememberVault(vault.root);
  return infoOf(vault);
}

function requireVault(): Vault {
  if (!currentVault) throw new Error('no vault is open');
  return currentVault;
}

/** Remembered vaults that still exist and are valid, most-recent first. */
async function validRecentVaults(): Promise<RecentVault[]> {
  const result: RecentVault[] = [];
  for (const path of readConfig().recent) {
    if (await isVault(path)) result.push({ name: vaultName(path), path });
  }
  return result;
}

// A fresh vault opens onto a small, folder-organised starter set that explains the product and
// gives search / RAG something real to work with — not an empty tree. Only seeded on create, never
// when opening an existing folder. Authored as native block JSON directly so main never imports the
// Markdown converter (jsdom can't be bundled into the Electron main process).
const h = (level: 1 | 2 | 3, text: string): unknown => ({
  type: 'heading',
  props: { level },
  content: [{ type: 'text', text, styles: {} }],
});
const p = (text: string): unknown => ({
  type: 'paragraph',
  content: [{ type: 'text', text, styles: {} }],
});
const li = (text: string): unknown => ({
  type: 'bulletListItem',
  content: [{ type: 'text', text, styles: {} }],
});
const mermaid = (src: string): unknown => ({
  type: 'codeBlock',
  props: { language: 'mermaid' },
  content: [{ type: 'text', text: src, styles: {} }],
});

interface SeedNote {
  path: string;
  title: string;
  tags: string[];
  blocks: unknown[];
}

const SEED_NOTES: SeedNote[] = [
  {
    path: 'Welcome.note.json',
    title: 'Welcome',
    tags: ['guide'],
    blocks: [
      h(1, 'Welcome to your Second Brain'),
      p(
        'A local-first place to think, write, and find things again. Every note is a plain file in a folder you own — nothing leaves your machine unless you choose to connect a provider.',
      ),
      mermaid(
        'graph LR\n  You["You"] --> Vault["Your vault (plain files)"]\n  Agents["AI agents"] --> Vault\n  Vault --> Search["Find by keyword or meaning"]',
      ),
      p(
        'This starter set explains how everything works — edit or delete any of it. Right-click the sidebar to add your own notes and folders.',
      ),
      li('Guide — how folders, tags, search, agents, and diagrams work.'),
      li('Ideas — the thinking behind the app.'),
      li('Journal — an example daily note.'),
    ],
  },
  {
    path: 'Guide/Organising with folders and tags.note.json',
    title: 'Organising with folders and tags',
    tags: ['guide', 'organisation'],
    blocks: [
      h(1, 'Folders and tags'),
      p(
        'Your folder tree is the organisation — there is no hidden database mapping notes to places. Drag a note onto a folder to move it, or onto the gap between notes to reorder; the order is remembered.',
      ),
      p(
        'Tags live in a note’s metadata and cut across folders, so a single note can belong to many themes at once. Use folders for where something lives and tags for what it is about.',
      ),
      li('Move: drop onto a folder’s middle.'),
      li('Reorder: drop on a sibling’s top or bottom edge.'),
      li('Rename a note by editing its title — the file is renamed to match.'),
    ],
  },
  {
    path: 'Guide/Finding anything — search and RAG.note.json',
    title: 'Finding anything — search and RAG',
    tags: ['guide', 'search'],
    blocks: [
      h(1, 'Search and retrieval'),
      p(
        'Press ⌘K anywhere to search. Keyword search is always on and fully local — it matches the exact words in your notes and highlights them in the results.',
      ),
      p(
        'Semantic search is optional. When you turn it on in Settings, the app also finds notes by meaning, so a search for “staying focused” can surface a note about attention and deep work even if those exact words never appear. Keyword and semantic results are blended into one ranked list.',
      ),
      p(
        'The recommended setup runs a small model (EmbeddingGemma) entirely on your device, so semantic search stays private and works offline. You can also point it at Ollama, OpenAI, or another provider.',
      ),
    ],
  },
  {
    path: 'Guide/AI agents and your rules.note.json',
    title: 'AI agents and your rules',
    tags: ['guide', 'agents'],
    blocks: [
      h(1, 'Let agents work in your vault'),
      p(
        'The whole vault is designed to be readable and writable by AI agents through a CLI and an MCP server, so you can ask an assistant to “summarise my last 24 hours and file the notes where they belong.”',
      ),
      p(
        'Agents follow rules you define — conventions for where things go and how they are named — so their edits fit your system instead of fighting it. Because everything is plain files, an agent’s changes are just ordinary note edits you can review, keep, or undo.',
      ),
      mermaid(
        'sequenceDiagram\n  You->>Agent: Summarise today\n  Agent->>Vault: Search + read notes\n  Agent->>Vault: Write summary\n  Vault-->>You: New note, filed by your rules',
      ),
    ],
  },
  {
    path: 'Guide/Diagrams and rich content.note.json',
    title: 'Diagrams and rich content',
    tags: ['guide', 'diagrams'],
    blocks: [
      h(1, 'Diagrams render inline'),
      p(
        'Write a Mermaid code block and it renders as a diagram right in the note — flowcharts, sequence diagrams, and more. The source stays editable, and it exports cleanly as Markdown.',
      ),
      mermaid(
        'flowchart TD\n  Idea([Idea]) --> Note[Capture as a note]\n  Note --> Tag[Tag & file it]\n  Tag --> Find[Find it later by meaning]',
      ),
      p('Type “/mermaid” in the editor to drop in a starter diagram.'),
    ],
  },
  {
    path: 'Ideas/Why local-first and private by default.note.json',
    title: 'Why local-first and private by default',
    tags: ['ideas', 'principles'],
    blocks: [
      h(1, 'Principles'),
      p(
        'Your notes are the source of truth, not a cloud service. They are documented JSON files in folders you control, so the vault stays usable even with the app uninstalled — and a whole-vault Markdown export always works.',
      ),
      li('Local-first: everything works offline; nothing is sent anywhere by default.'),
      li(
        'Files-first: search indexes and embeddings are derived and rebuildable — never the only copy of anything.',
      ),
      li('No lock-in: open formats, Markdown export at every surface.'),
      p(
        'Privacy is a default, not a setting you have to discover: semantic search ships with an on-device model, and any hosted provider is an explicit opt-in.',
      ),
    ],
  },
  {
    path: 'Journal/Example daily note.note.json',
    title: 'Example daily note',
    tags: ['journal'],
    blocks: [
      h(1, 'A day with your second brain'),
      p(
        'Daily notes are a nice home for quick capture — meetings, ideas, links, and small wins. Give them a consistent place (like this Journal folder) and an agent can roll them up for you later.',
      ),
      h(3, 'Today'),
      li('Set up my vault and read the guide.'),
      li('Tried ⌘K search and moved a few notes around.'),
      li('Idea: keep a running list of book highlights to revisit.'),
    ],
  },
];

async function seedStarterVault(vault: Vault): Promise<void> {
  for (const note of SEED_NOTES) {
    try {
      await createNote(vault, note.path, {
        title: note.title,
        tags: note.tags,
        blocks: note.blocks,
      });
    } catch {
      // Non-fatal: a seed failure must not block opening the vault.
    }
  }
}

// --- Free-name helpers for the tree's create actions -------------------------

async function createNoteWithFreeName(vault: Vault, folder: string, base: string): Promise<string> {
  for (let n = 0; ; n += 1) {
    const name = `${base}${n === 0 ? '' : ` ${n}`}${NOTE_EXTENSION}`;
    const relPath = folder ? `${folder}/${name}` : name;
    try {
      await createNote(vault, relPath, { title: base });
      return relPath;
    } catch (error) {
      if (error instanceof NoteExistsError) continue;
      throw error;
    }
  }
}

async function createFolderWithFreeName(
  vault: Vault,
  parent: string,
  base: string,
): Promise<string> {
  const existing = new Set((await listTree(vault.root)).map((n) => n.path));
  for (let n = 0; ; n += 1) {
    const name = `${base}${n === 0 ? '' : ` ${n}`}`;
    const relPath = parent ? `${parent}/${name}` : name;
    if (!existing.has(relPath)) {
      await createFolder(vault, relPath);
      return relPath;
    }
  }
}

// --- IPC handlers ------------------------------------------------------------

function registerHandlers(): void {
  ipcMain.handle(IPC.startup, async (): Promise<StartupState> => {
    // Consume any launch-time deep link (e.g. --route=settings) as the initial route.
    const route = pendingRoute ?? undefined;
    pendingRoute = null;
    const fromEnv = process.env.BRAIN_VAULT;
    if (fromEnv) {
      return { mode: 'ready', info: await activateVault(fromEnv), ...(route ? { route } : {}) };
    }
    // Remember the last vault and reopen it automatically (org/tenant model); the welcome screen
    // only appears on a true first run. Switching later goes through the in-app vault switcher.
    const recent = await validRecentVaults();
    const last = recent[0];
    if (last) {
      return { mode: 'ready', info: await activateVault(last.path), ...(route ? { route } : {}) };
    }
    return { mode: 'setup', recent, suggestedPath: suggestedNewVaultPath() };
  });

  ipcMain.handle(IPC.recentVaults, () => validRecentVaults());

  ipcMain.handle(IPC.getSettings, (): Settings => readSettings());
  ipcMain.handle(IPC.setSettings, (_event, patch: Partial<Settings>): Settings => {
    const saved = saveSettings(patch);
    nativeTheme.themeSource = saved.theme; // fires nativeTheme 'updated' → broadcastAppearance
    applyTranslucency();
    broadcastAppearance();
    // An embedding-config change rebuilds the provider and (re)embeds against the current index —
    // so turning semantic search on/off or changing the model takes effect immediately.
    if (patch.embedding) {
      void embeddings.refresh().then(() => embeddings.runPass());
    }
    return saved;
  });

  ipcMain.handle(IPC.createVault, async (): Promise<VaultInfo> => {
    const info = await activateVault(suggestedNewVaultPath());
    await seedStarterVault(requireVault());
    return info;
  });

  ipcMain.handle(IPC.pickVault, async (): Promise<VaultInfo | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Open a vault folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return null;
    return activateVault(picked);
  });

  ipcMain.handle(IPC.openRecent, async (_event, path: string): Promise<VaultInfo | null> => {
    if (!(await isVault(path))) return null;
    return activateVault(path);
  });

  ipcMain.handle(IPC.appearance, (): Appearance => currentAppearance());

  ipcMain.handle(IPC.vaultInfo, (): VaultInfo => infoOf(requireVault()));
  ipcMain.handle(IPC.vaultTree, () => listTree(requireVault().root));
  ipcMain.handle(IPC.readNote, async (_event, path: string): Promise<ReadNoteResult> => {
    const vault = requireVault();
    const [note, hash] = await Promise.all([readNote(vault, path), hashNote(vault, path)]);
    return { note, hash };
  });
  ipcMain.handle(
    IPC.saveBlocks,
    async (_event, path: string, blocks: unknown[], baseHash: string): Promise<SaveResult> => {
      try {
        const hash = await updateNoteBlocksGuarded(requireVault(), path, blocks, baseHash);
        return { status: 'saved', hash };
      } catch (error) {
        if (error instanceof NoteConflictError) return { status: 'conflict' };
        throw error;
      }
    },
  );
  ipcMain.handle(
    IPC.setTags,
    async (_event, path: string, tags: string[]): Promise<SetTagsResult> => {
      const vault = requireVault();
      const note = await updateNoteTags(vault, path, tags);
      return { tags: note.meta.tags ?? [], hash: await hashNote(vault, path) };
    },
  );
  ipcMain.handle(
    IPC.setTitle,
    async (_event, path: string, title: string): Promise<SetTitleResult> => {
      const vault = requireVault();
      const trimmed = title.trim();
      if (!trimmed) return { path, title: '' };
      await updateNoteTitle(vault, path, trimmed);
      // Keep the filename in step with the title (sanitized, de-duplicated in the same folder).
      const base = trimmed.replace(/[\\/]/g, '-').replace(/^\.+/, '').replace(/\s+/g, ' ').trim();
      const currentBase = basename(path, NOTE_EXTENSION);
      if (!base || base === currentBase) return { path, title: trimmed };
      const dir = dirname(path);
      for (let n = 0; ; n += 1) {
        const name = `${base}${n === 0 ? '' : ` ${n}`}${NOTE_EXTENSION}`;
        if (dir !== '.' && `${dir}/${name}` === path) return { path, title: trimmed };
        try {
          return { path: await renameNote(vault, path, name), title: trimmed };
        } catch (error) {
          if (error instanceof NoteExistsError) continue;
          throw error;
        }
      }
    },
  );
  ipcMain.handle(IPC.newNote, (_event, folder: string) =>
    createNoteWithFreeName(requireVault(), folder, 'Untitled'),
  );
  ipcMain.handle(IPC.newFolder, (_event, parent: string) =>
    createFolderWithFreeName(requireVault(), parent, 'New folder'),
  );
  ipcMain.handle(IPC.rename, (_event, path: string, newName: string) =>
    renameNote(requireVault(), path, newName),
  );
  ipcMain.handle(IPC.move, async (_event, fromPath: string, toPath: string) => {
    await moveNote(requireVault(), fromPath, toPath);
  });
  ipcMain.handle(IPC.trash, async (_event, path: string) => {
    await trashNote(requireVault(), path);
  });
  ipcMain.handle(IPC.renameFolder, (_event, path: string, newName: string) =>
    renameFolder(requireVault(), path, newName),
  );
  ipcMain.handle(IPC.moveFolder, async (_event, fromPath: string, toPath: string) => {
    await moveFolder(requireVault(), fromPath, toPath);
  });
  ipcMain.handle(IPC.trashFolder, async (_event, path: string) => {
    await trashFolder(requireVault(), path);
  });
  ipcMain.handle(IPC.setOrder, async (_event, folder: string, orderedNames: string[]) => {
    await setFolderOrder(requireVault(), folder, orderedNames);
  });
  ipcMain.handle(IPC.search, (_event, query: string, limit?: number) =>
    searchIndex ? embeddings.search(searchIndex, query, limit) : [],
  );

  // --- Embeddings / semantic-search provider management (ADR 0008) ---
  ipcMain.handle(IPC.scanProviders, () => embeddings.scan());
  ipcMain.handle(IPC.listModels, (_event, kind: ProviderKind) => embeddings.listModels(kind));
  ipcMain.handle(IPC.testProvider, () => embeddings.test());
  ipcMain.handle(
    IPC.setEmbeddingSecret,
    async (_event, kind: ProviderKind, secret: ProviderSecretInput) => {
      writeSecret(kind, secret);
      await embeddings.refresh(); // pick up the new secret immediately
    },
  );
  ipcMain.handle(IPC.hasEmbeddingSecret, (_event, kind: ProviderKind) =>
    Boolean(readConfig().secrets[kind]),
  );
  ipcMain.handle(IPC.secretStorageAvailable, () => secretStorageAvailable());
  ipcMain.handle(IPC.rebuildIndex, async () => {
    if (currentVault) await embeddings.rebuild(currentVault);
  });
  ipcMain.handle(IPC.clearSemanticIndex, () => embeddings.clearSemantic());
  ipcMain.handle(IPC.indexStats, (): IndexStats => embeddings.stats());
  ipcMain.handle(IPC.pauseIndexing, (_event, paused: boolean) => embeddings.setPaused(paused));
  ipcMain.handle(IPC.builtinModelReady, (): boolean => embeddings.builtinReady());
  ipcMain.handle(IPC.downloadBuiltinModel, () => embeddings.downloadBuiltin());
}

// --- Appearance (native theme + translucency) --------------------------------

const OPAQUE_BG = { light: '#f6f1e7', dark: '#1a1815' } as const;

/** Whether a real OS translucency effect is active (and not suppressed by accessibility/override). */
function translucencyActive(): boolean {
  if (process.env.BRAIN_NO_VIBRANCY) return false; // opaque override (tests, screenshots)
  if (readSettings().reduceTransparency) return false; // user preference
  if (nativeTheme.prefersReducedTransparency) return false; // OS accessibility
  return isMac || isWin; // macOS vibrancy / Windows Mica; degrades to opaque elsewhere
}

/** Apply the current translucency preference to open windows live (no relaunch needed). */
function applyTranslucency(): void {
  const active = translucencyActive();
  const bg = OPAQUE_BG[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'];
  for (const win of BrowserWindow.getAllWindows()) {
    if (isMac) win.setVibrancy(active ? 'sidebar' : null);
    else if (isWin) win.setBackgroundMaterial(active ? 'mica' : 'none');
    if (!active) win.setBackgroundColor(bg);
  }
}

function currentAppearance(): Appearance {
  return {
    theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    translucent: translucencyActive(),
    platform: isMac ? 'darwin' : isWin ? 'win32' : 'linux',
  };
}

function broadcastAppearance(): void {
  const appearance = currentAppearance();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.appearanceChanged, appearance);
  }
}

/** Platform- and accessibility-aware window options: vibrancy/Mica when available, else opaque. */
function windowEffectOptions(): Electron.BrowserWindowConstructorOptions {
  const dark = nativeTheme.shouldUseDarkColors;
  const translucent = translucencyActive();
  if (isMac) {
    return translucent
      ? {
          vibrancy: 'sidebar',
          visualEffectState: 'followWindow',
          backgroundColor: '#00000000', // let the vibrancy show through
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {
          backgroundColor: OPAQUE_BG[dark ? 'dark' : 'light'],
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 18 },
        };
  }
  if (isWin) {
    return {
      ...(translucent ? { backgroundMaterial: 'mica' } : {}),
      backgroundColor: OPAQUE_BG[dark ? 'dark' : 'light'],
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: dark ? '#d8d0c2' : '#4a4438',
        height: 44,
      },
    };
  }
  return { backgroundColor: OPAQUE_BG[dark ? 'dark' : 'light'] }; // Linux/other: opaque, native frame
}

// --- Application menu (fixes the "Electron" app-name label) -------------------

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } satisfies Electron.MenuItemConstructorOptions,
        ]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Deep links / open-to-page (secondbrain://…, --route=…) ------------------

let pendingRoute: string | null = null;

/** Pull a route URL from argv: `--route=<url>` or a `secondbrain://…` argument. */
function extractRouteArg(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('--route=')) return arg.slice('--route='.length);
    if (arg.startsWith(`${APP_SCHEME}://`)) return arg;
  }
  return null;
}

/** Send a route to open windows, or hold it until one exists. */
function navigateTo(routeUrl: string): void {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    pendingRoute = routeUrl;
    return;
  }
  for (const win of windows) win.webContents.send(IPC.navigate, routeUrl);
}

app.setAsDefaultProtocolClient(APP_SCHEME);
app.on('open-url', (event, url) => {
  // macOS delivers `secondbrain://…` here (and to the already-running instance).
  event.preventDefault();
  navigateTo(url);
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    ...windowEffectOptions(),
    webPreferences: {
      // electron-vite emits the preload as ESM (.mjs) in this "type": "module" package.
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = readSettings().theme; // apply the saved theme preference before painting
  pendingRoute = extractRouteArg(process.argv); // open-to-page from launch args (CLI/deep link)
  registerHandlers();
  buildAppMenu();
  createWindow();
  // Push live appearance updates when the OS theme or transparency preference changes.
  nativeTheme.on('updated', broadcastAppearance);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Release the derived index (and its WAL) cleanly on shutdown.
app.on('will-quit', () => {
  searchIndex?.close();
  searchIndex = null;
});
