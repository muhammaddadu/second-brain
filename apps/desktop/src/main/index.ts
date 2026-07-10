/**
 * Electron main process: the only place vault I/O runs. Owns the app lifecycle (which vault is
 * open, first-run setup) and answers the renderer's IPC by forwarding to @brain/core. The renderer
 * never touches the filesystem — it talks only through the preload bridge (app-architecture.md).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  addProperty,
  buildGraph,
  collectVaultLinks,
  createDatabase,
  createFolderWithUniqueName,
  createNote,
  createNoteWithUniqueName,
  getBacklinks,
  hashNote,
  importFileAsNote,
  indexPath,
  initVault,
  isVault,
  listDatabases,
  listRows,
  listTree,
  moveFolder,
  moveNote,
  NOTE_EXTENSION,
  NoteConflictError,
  openSearchIndex,
  openVault,
  type PropertyType,
  type ProviderKind,
  readDatabase,
  readNote,
  readRules,
  reindexNote,
  renameFolder,
  renameNote,
  resolveWikilink,
  type SearchIndex,
  setFolderOrder,
  setNoteTitle,
  setRowProperty,
  syncAgentGuide,
  trashFolder,
  trashNote,
  updateNoteBlocksGuarded,
  updateNoteTags,
  type Vault,
  type VaultWatcher,
  watchVault,
  writeRules,
} from '@brain/core';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme } from 'electron';
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
} from '../shared/ipc';
import { APP_SCHEME } from '../shared/route';
import { agentSkillStatus, installAgentSkill, removeAgentSkill } from './agent-skill';
import { addCliToPath, cliStatus, installCli, removeCli } from './cli-install';
import {
  readConfig,
  readSecret,
  readSettings,
  rememberVault,
  saveSettings,
  secretStorageAvailable,
  writeSecret,
} from './config';
import { createEmbeddingService } from './embedding-service';
import { seedStarterVault } from './seed-notes';
import { checkForUpdates, initAutoUpdate, installUpdate } from './updater';

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

/** The embedding/semantic-search service — owns provider state + indexing; see ./embedding-service. */
const embeddings = createEmbeddingService({
  getIndex: () => searchIndex,
  getSettings: readSettings,
  readSecret,
  pushStatus: pushIndexStatus,
  builtinCacheDir: join(app.getPath('userData'), 'models'),
});

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
  // Keep the vault's agent guide (AGENTS.md) present and current, without clobbering owner edits.
  void syncAgentGuide(vault).catch((error) => console.error('agent guide sync failed', error));
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
          void embeddings.runPass(index); // embed into *this* vault's index (captured), not the live one
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
    (_event, path: string, title: string): Promise<SetTitleResult> =>
      setNoteTitle(requireVault(), path, title),
  );
  ipcMain.handle(IPC.newNote, (_event, folder: string) =>
    createNoteWithUniqueName(requireVault(), folder, 'Untitled'),
  );
  ipcMain.handle(IPC.newFolder, (_event, parent: string, base?: string) =>
    createFolderWithUniqueName(requireVault(), parent, base ?? 'New folder'),
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
  ipcMain.handle(IPC.resolveLink, (_event, target: string) => {
    // Resolve against the index's note list (paths + titles) — no file reads, so link clicks are instant.
    const notes = searchIndex ? searchIndex.graphNotes() : [];
    return resolveWikilink(target, notes);
  });
  ipcMain.handle(IPC.backlinks, (_event, path: string) => getBacklinks(requireVault(), path));
  ipcMain.handle(IPC.noteRefs, () =>
    (searchIndex ? searchIndex.graphNotes() : []).map((n) => ({ path: n.path, title: n.title })),
  );
  ipcMain.handle(IPC.createNoteFromLink, async (_event, target: string) => {
    const clean = target
      .trim()
      .replace(/^\.?\//, '')
      .replace(new RegExp(`${NOTE_EXTENSION}$`), '');
    const relPath = `${clean}${NOTE_EXTENSION}`;
    const title = clean.split('/').pop() ?? clean;
    await createNote(requireVault(), relPath, { title });
    return relPath;
  });
  ipcMain.handle(
    IPC.importFiles,
    async (_event, folder: string, files: Array<{ name: string; data: Uint8Array }>) => {
      const results = [];
      for (const file of files) {
        results.push(await importFileAsNote(requireVault(), folder, file.name, file.data));
      }
      return results;
    },
  );
  ipcMain.handle(IPC.search, (_event, query: string, limit?: number) =>
    searchIndex ? embeddings.search(searchIndex, query, limit) : [],
  );
  // Databases (E8) — one-line forwards into core.
  ipcMain.handle(IPC.getDatabase, (_event, folder: string) => readDatabase(requireVault(), folder));
  ipcMain.handle(IPC.createDatabase, (_event, folder: string) =>
    createDatabase(requireVault(), folder),
  );
  ipcMain.handle(
    IPC.addProperty,
    async (_event, folder: string, name: string, type: PropertyType, options?: string[]) => {
      await addProperty(requireVault(), folder, { name, type, ...(options ? { options } : {}) });
      return readDatabase(requireVault(), folder);
    },
  );
  ipcMain.handle(
    IPC.setRowProperty,
    (_event, folder: string, path: string, propertyId: string, value: unknown) =>
      setRowProperty(requireVault(), folder, path, propertyId, value),
  );
  ipcMain.handle(IPC.listRows, (_event, folder: string) => listRows(requireVault(), folder));
  ipcMain.handle(IPC.listDatabases, () => listDatabases(requireVault()));

  ipcMain.handle(IPC.graph, async (_event, threshold?: number) => {
    if (!searchIndex) return { nodes: [], edges: [] };
    const model = embeddings.provider()?.model;
    // Explicit wikilinks (read from files) become link edges alongside tag/semantic similarity.
    const { links } = await collectVaultLinks(requireVault());
    return buildGraph(searchIndex, {
      ...(model ? { model } : {}),
      ...(typeof threshold === 'number' ? { threshold } : {}),
      links,
    });
  });

  // --- Embeddings / semantic-search provider management (ADR 0008) ---
  ipcMain.handle(IPC.scanProviders, () => embeddings.scan());
  ipcMain.handle(IPC.listModels, (_event, kind: ProviderKind) => embeddings.listModels(kind));
  ipcMain.handle(IPC.testProvider, () => embeddings.test());
  ipcMain.handle(
    IPC.setEmbeddingSecret,
    async (_event, kind: ProviderKind, secret: ProviderSecretInput) => {
      writeSecret(kind, secret);
      await embeddings.refresh(); // pick up the new secret immediately
      void embeddings.runPass(); // a valid key may unblock a provider that couldn't embed before
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

  // Global agent skill (ADR 0009).
  ipcMain.handle(IPC.agentSkillStatus, () => agentSkillStatus());
  ipcMain.handle(IPC.installAgentSkill, (_event, id: string) => installAgentSkill(id));
  ipcMain.handle(IPC.removeAgentSkill, (_event, id: string) => removeAgentSkill(id));
  ipcMain.handle(IPC.checkForUpdates, () => checkForUpdates());
  ipcMain.handle(IPC.installUpdate, () => installUpdate());
  ipcMain.handle(IPC.cliStatus, () => cliStatus());
  ipcMain.handle(IPC.installCli, () => installCli());
  ipcMain.handle(IPC.addCliToPath, () => addCliToPath());
  ipcMain.handle(IPC.removeCli, () => removeCli());
  ipcMain.handle(IPC.getRules, () => readRules(requireVault()));
  ipcMain.handle(IPC.setRules, (_event, text: string) => writeRules(requireVault(), text));
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
              {
                label: 'Check for Updates…',
                click: () => void checkForUpdates(),
              },
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

/**
 * In development the app runs from the raw Electron binary, so it shows Electron's own icon (and, on
 * macOS, "Electron" as the dock label). Packaged builds get the real icon + productName from
 * electron-builder; here we load the source icon so at least the icon is ours while developing.
 * Returns null when packaged or the file is missing. (`__dirname` is `out/main` at runtime.)
 */
function devIcon(): Electron.NativeImage | null {
  if (app.isPackaged) return null;
  const img = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'));
  return img.isEmpty() ? null : img;
}

function createWindow(): void {
  const icon = devIcon();
  const window = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    ...(icon ? { icon } : {}), // Windows/Linux window + taskbar icon in dev
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
  // macOS dock icon in development (packaged builds use the bundle's icns). The dock *label* stays
  // "Electron" in dev — it's the Electron.app bundle — but is correct ("Second Brain") when packaged.
  const icon = devIcon();
  if (icon && process.platform === 'darwin') app.dock?.setIcon(icon);
  pendingRoute = extractRouteArg(process.argv); // open-to-page from launch args (CLI/deep link)
  registerHandlers();
  buildAppMenu();
  createWindow();
  initAutoUpdate(); // packaged builds: check this env's channel for a newer release
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
