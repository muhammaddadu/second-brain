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
  readNote,
  reindexNote,
  renameFolder,
  renameNote,
  type SearchIndex,
  setFolderOrder,
  syncIndex,
  trashFolder,
  trashNote,
  updateNoteBlocksGuarded,
  updateNoteTags,
  updateNoteTitle,
  type Vault,
  type VaultWatcher,
  watchVault,
} from '@brain/core';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from 'electron';
import {
  type Appearance,
  IPC,
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

// --- Config (remembered vaults) ---------------------------------------------

interface Config {
  recent: string[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { theme: 'system', reduceTransparency: false };

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
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
    return { recent, settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) } };
  } catch {
    return { recent: [], settings: DEFAULT_SETTINGS };
  }
}

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
  void syncIndex(vault, index).catch((error) => console.error('index sync failed', error));
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

// A fresh vault opens onto a friendly note (a rendered diagram, not an empty tree) — low cognitive
// load for the first run. Only seeded on create, never when opening an existing folder. Built as
// native block JSON directly so main never imports the Markdown converter (jsdom can't be bundled
// into the Electron main process).
const WELCOME_BLOCKS: unknown[] = [
  {
    type: 'heading',
    props: { level: 1 },
    content: [{ type: 'text', text: 'Welcome to your Second Brain', styles: {} }],
  },
  {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: 'This is a note — edit it, or delete it. Everything here is a plain file in a folder you own.',
        styles: {},
      },
    ],
  },
  {
    type: 'codeBlock',
    props: { language: 'mermaid' },
    content: [
      {
        type: 'text',
        text: 'graph LR\n  You["You"] --> Vault["Your vault"]\n  Agents["AI agents"] --> Vault\n  Vault --> Find["Find anything"]',
        styles: {},
      },
    ],
  },
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Right-click the sidebar to add notes and folders.', styles: {} },
    ],
  },
];

async function seedWelcomeNote(vault: Vault): Promise<void> {
  try {
    await createNote(vault, 'Welcome.note.json', { title: 'Welcome', blocks: WELCOME_BLOCKS });
  } catch {
    // Non-fatal: a seed failure must not block opening the vault.
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
    return saved;
  });

  ipcMain.handle(IPC.createVault, async (): Promise<VaultInfo> => {
    const info = await activateVault(suggestedNewVaultPath());
    await seedWelcomeNote(requireVault());
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
    searchIndex ? searchIndex.search(query, limit) : [],
  );
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
