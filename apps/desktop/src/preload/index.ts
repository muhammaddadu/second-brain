/**
 * Preload bridge: exposes a narrow, typed `window.vault` API to the renderer over contextIsolation.
 * Every method just forwards to a main-process IPC handler — no logic, no filesystem here.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type VaultApi, type VaultChangePayload } from '../shared/ipc.js';

const vault: VaultApi = {
  startup: () => ipcRenderer.invoke(IPC.startup),
  createVault: () => ipcRenderer.invoke(IPC.createVault),
  pickVault: () => ipcRenderer.invoke(IPC.pickVault),
  openRecent: (path) => ipcRenderer.invoke(IPC.openRecent, path),
  info: () => ipcRenderer.invoke(IPC.vaultInfo),
  tree: () => ipcRenderer.invoke(IPC.vaultTree),
  readNote: (path) => ipcRenderer.invoke(IPC.readNote, path),
  saveBlocks: (path, blocks, baseHash) =>
    ipcRenderer.invoke(IPC.saveBlocks, path, blocks, baseHash),
  setTags: (path, tags) => ipcRenderer.invoke(IPC.setTags, path, tags),
  newNote: (folder) => ipcRenderer.invoke(IPC.newNote, folder),
  newFolder: (parent) => ipcRenderer.invoke(IPC.newFolder, parent),
  rename: (path, newName) => ipcRenderer.invoke(IPC.rename, path, newName),
  move: (fromPath, toPath) => ipcRenderer.invoke(IPC.move, fromPath, toPath),
  trash: (path) => ipcRenderer.invoke(IPC.trash, path),
  onVaultChange: (listener) => {
    const handler = (_event: unknown, change: VaultChangePayload) => listener(change);
    ipcRenderer.on(IPC.changed, handler);
    return () => ipcRenderer.removeListener(IPC.changed, handler);
  },
};

contextBridge.exposeInMainWorld('vault', vault);
