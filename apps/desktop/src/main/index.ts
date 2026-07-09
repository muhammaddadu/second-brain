/**
 * Electron main process: the only place vault I/O runs. Resolves which vault to open, constructs
 * the core {@link Vault}, and answers the renderer's IPC calls by forwarding to @brain/core. The
 * renderer never touches the filesystem — it talks only through the preload bridge to these
 * handlers (app-architecture.md boundary rules).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTree, openVault, readNote, type Vault } from '@brain/core';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC, type VaultInfo } from '../shared/ipc.js';

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

function registerVaultHandlers(vault: Vault): void {
  ipcMain.handle(IPC.vaultInfo, (): VaultInfo => {
    const name = vault.root.split(/[\\/]/).filter(Boolean).pop() ?? vault.root;
    return { name, root: vault.root };
  });
  ipcMain.handle(IPC.vaultTree, () => listTree(vault.root));
  ipcMain.handle(IPC.readNote, (_event, path: string) => readNote(vault, path));
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
  registerVaultHandlers(openVault(vaultPath));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
