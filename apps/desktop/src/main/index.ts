/**
 * Electron main process: the only place vault I/O runs. Owns the app lifecycle (which vault is
 * open, first-run setup) and answers the renderer's IPC by forwarding to @brain/core. The renderer
 * never touches the filesystem — it talks only through the preload bridge (app-architecture.md).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createFolder,
  createNote,
  hashNote,
  initVault,
  isVault,
  listTree,
  moveNote,
  NOTE_EXTENSION,
  NoteConflictError,
  NoteExistsError,
  openVault,
  readNote,
  renameNote,
  trashNote,
  updateNoteBlocksGuarded,
  updateNoteTags,
  type Vault,
  type VaultWatcher,
  watchVault,
} from '@brain/core';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import {
  IPC,
  type ReadNoteResult,
  type RecentVault,
  type SaveResult,
  type SetTagsResult,
  type StartupState,
  type VaultChangePayload,
  type VaultInfo,
} from '../shared/ipc.js';

const MAX_RECENT = 8;
const DEFAULT_VAULT_NAME = 'Second Brain';

let currentVault: Vault | null = null;
let watcher: VaultWatcher | null = null;

// --- Config (remembered vaults) ---------------------------------------------

interface Config {
  recent: string[];
}

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
    return { recent };
  } catch {
    return { recent: [] };
  }
}

function rememberVault(vaultPath: string): void {
  const recent = [vaultPath, ...readConfig().recent.filter((p) => p !== vaultPath)].slice(
    0,
    MAX_RECENT,
  );
  try {
    writeFileSync(configPath(), `${JSON.stringify({ recent }, null, 2)}\n`, 'utf8');
  } catch {
    // Non-fatal: we just won't remember across launches.
  }
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
  watcher = watchVault(vault, async (change) => {
    let hash: string | undefined;
    if (change.type !== 'unlink' && change.path.endsWith(NOTE_EXTENSION)) {
      try {
        hash = await hashNote(vault, change.path);
      } catch {
        // File may have vanished between event and hash; leave hash undefined.
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
    const fromEnv = process.env.BRAIN_VAULT;
    if (fromEnv) {
      return { mode: 'ready', info: await activateVault(fromEnv) };
    }
    const recent: RecentVault[] = [];
    for (const path of readConfig().recent) {
      if (await isVault(path)) recent.push({ name: vaultName(path), path });
    }
    return { mode: 'setup', recent, suggestedPath: suggestedNewVaultPath() };
  });

  ipcMain.handle(IPC.createVault, () => activateVault(suggestedNewVaultPath()));

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
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1160,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Second Brain',
    backgroundColor: '#f6f1e7',
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
  registerHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
