/**
 * Preload bridge: exposes a narrow, typed `window.vault` API to the renderer over contextIsolation.
 * Every method just forwards to a main-process IPC handler — no logic, no filesystem here.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type VaultApi } from '../shared/ipc.js';

const vault: VaultApi = {
  info: () => ipcRenderer.invoke(IPC.vaultInfo),
  tree: () => ipcRenderer.invoke(IPC.vaultTree),
  readNote: (path: string) => ipcRenderer.invoke(IPC.readNote, path),
  saveBlocks: (path: string, blocks: unknown[]) => ipcRenderer.invoke(IPC.saveBlocks, path, blocks),
  setTags: (path: string, tags: string[]) => ipcRenderer.invoke(IPC.setTags, path, tags),
};

contextBridge.exposeInMainWorld('vault', vault);
