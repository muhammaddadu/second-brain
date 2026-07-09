/**
 * Preload bridge: exposes a narrow, typed `window.vault` API to the renderer over contextIsolation.
 * Every method just forwards to a main-process IPC handler — no logic, no filesystem here.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { type Appearance, IPC, type VaultApi, type VaultChangePayload } from '../shared/ipc.js';

const vault: VaultApi = {
  startup: () => ipcRenderer.invoke(IPC.startup),
  appearance: () => ipcRenderer.invoke(IPC.appearance),
  onAppearanceChange: (listener) => {
    const handler = (_event: unknown, appearance: Appearance) => listener(appearance);
    ipcRenderer.on(IPC.appearanceChanged, handler);
    return () => ipcRenderer.removeListener(IPC.appearanceChanged, handler);
  },
  createVault: () => ipcRenderer.invoke(IPC.createVault),
  pickVault: () => ipcRenderer.invoke(IPC.pickVault),
  openRecent: (path) => ipcRenderer.invoke(IPC.openRecent, path),
  recentVaults: () => ipcRenderer.invoke(IPC.recentVaults),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  onNavigate: (listener) => {
    const handler = (_event: unknown, routeUrl: string) => listener(routeUrl);
    ipcRenderer.on(IPC.navigate, handler);
    return () => ipcRenderer.removeListener(IPC.navigate, handler);
  },
  info: () => ipcRenderer.invoke(IPC.vaultInfo),
  tree: () => ipcRenderer.invoke(IPC.vaultTree),
  readNote: (path) => ipcRenderer.invoke(IPC.readNote, path),
  saveBlocks: (path, blocks, baseHash) =>
    ipcRenderer.invoke(IPC.saveBlocks, path, blocks, baseHash),
  setTags: (path, tags) => ipcRenderer.invoke(IPC.setTags, path, tags),
  setTitle: (path, title) => ipcRenderer.invoke(IPC.setTitle, path, title),
  newNote: (folder) => ipcRenderer.invoke(IPC.newNote, folder),
  newFolder: (parent) => ipcRenderer.invoke(IPC.newFolder, parent),
  rename: (path, newName) => ipcRenderer.invoke(IPC.rename, path, newName),
  move: (fromPath, toPath) => ipcRenderer.invoke(IPC.move, fromPath, toPath),
  trash: (path) => ipcRenderer.invoke(IPC.trash, path),
  renameFolder: (path, newName) => ipcRenderer.invoke(IPC.renameFolder, path, newName),
  moveFolder: (fromPath, toPath) => ipcRenderer.invoke(IPC.moveFolder, fromPath, toPath),
  trashFolder: (path) => ipcRenderer.invoke(IPC.trashFolder, path),
  onVaultChange: (listener) => {
    const handler = (_event: unknown, change: VaultChangePayload) => listener(change);
    ipcRenderer.on(IPC.changed, handler);
    return () => ipcRenderer.removeListener(IPC.changed, handler);
  },
};

contextBridge.exposeInMainWorld('vault', vault);
