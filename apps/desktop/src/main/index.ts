/**
 * Electron main process: the only place vault I/O runs. Resolves which vault to open, constructs
 * the core {@link Vault}, and answers the renderer's IPC calls by forwarding to @brain/core. The
 * renderer never touches the filesystem — it talks only through the preload bridge to these
 * handlers (app-architecture.md boundary rules).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createFolder,
  createNote,
  hashNote,
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
  watchVault,
} from '@brain/core';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import {
  IPC,
  type ReadNoteResult,
  type SaveResult,
  type SetTagsResult,
  type VaultChangePayload,
  type VaultInfo,
} from '../shared/ipc.js';

/** Where we remember the last-opened vault between launches. */
function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function readSavedVaultPath(): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as { vaultPath?: unknown };
    return typeof raw.vaultPath === 'string' ? raw.vaultPath : undefined;
  } catch {
    return undefined;
  }
}

function saveVaultPath(vaultPath: string): void {
  try {
    writeFileSync(configPath(), `${JSON.stringify({ vaultPath }, null, 2)}\n`, 'utf8');
  } catch {
    // Non-fatal: we just won't remember the choice next launch.
  }
}

/**
 * Decide which vault to open: an explicit `BRAIN_VAULT` env var (used by dev and E2E) wins, then
 * the remembered path, then a native folder picker. Returns undefined if the user cancels.
 */
async function resolveVaultPath(): Promise<string | undefined> {
  const fromEnv = process.env.BRAIN_VAULT;
  if (fromEnv) return fromEnv;

  const saved = readSavedVaultPath();
  if (saved) return saved;

  const result = await dialog.showOpenDialog({
    title: 'Choose your vault folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  const picked = result.filePaths[0];
  if (result.canceled || !picked) return undefined;
  saveVaultPath(picked);
  return picked;
}

/** Find a free `<base> [n].note.json` path in `folder` and create it. Returns the created path. */
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

/** Find a free `<base> [n]` folder under `parent` and create it. Returns the created path. */
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

function registerVaultHandlers(vault: Vault): void {
  ipcMain.handle(IPC.vaultInfo, (): VaultInfo => {
    const name = vault.root.split(/[\\/]/).filter(Boolean).pop() ?? vault.root;
    return { name, root: vault.root };
  });
  ipcMain.handle(IPC.vaultTree, () => listTree(vault.root));
  ipcMain.handle(IPC.readNote, async (_event, path: string): Promise<ReadNoteResult> => {
    const [note, hash] = await Promise.all([readNote(vault, path), hashNote(vault, path)]);
    return { note, hash };
  });
  ipcMain.handle(
    IPC.saveBlocks,
    async (_event, path: string, blocks: unknown[], baseHash: string): Promise<SaveResult> => {
      try {
        const hash = await updateNoteBlocksGuarded(vault, path, blocks, baseHash);
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
      const note = await updateNoteTags(vault, path, tags);
      return { tags: note.meta.tags ?? [], hash: await hashNote(vault, path) };
    },
  );
  ipcMain.handle(IPC.newNote, (_event, folder: string) =>
    createNoteWithFreeName(vault, folder, 'Untitled'),
  );
  ipcMain.handle(IPC.newFolder, (_event, parent: string) =>
    createFolderWithFreeName(vault, parent, 'New folder'),
  );
  ipcMain.handle(IPC.rename, (_event, path: string, newName: string) =>
    renameNote(vault, path, newName),
  );
  ipcMain.handle(IPC.move, async (_event, fromPath: string, toPath: string) => {
    await moveNote(vault, fromPath, toPath);
  });
  ipcMain.handle(IPC.trash, async (_event, path: string) => {
    await trashNote(vault, path);
  });
}

/** Watch the vault and push changes (with a fresh hash for note writes) to all windows. */
function startWatcher(vault: Vault): void {
  watchVault(vault, async (change) => {
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
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    title: 'Second Brain',
    backgroundColor: '#faf7f2',
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

app.whenReady().then(async () => {
  const vaultPath = await resolveVaultPath();
  if (!vaultPath) {
    app.quit();
    return;
  }
  const vault = openVault(vaultPath);
  registerVaultHandlers(vault);
  startWatcher(vault);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
