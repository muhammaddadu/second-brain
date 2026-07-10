/**
 * Preload bridge: exposes a narrow, typed `window.vault` API to the renderer over contextIsolation.
 * Every method just forwards to a main-process IPC handler — no logic, no filesystem here.
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  type Appearance,
  type ImportProgressStatus,
  type IndexStatus,
  IPC,
  type UpdateStatus,
  type VaultApi,
  type VaultChangePayload,
} from '../shared/ipc';

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
  newFolder: (parent, base) => ipcRenderer.invoke(IPC.newFolder, parent, base),
  rename: (path, newName) => ipcRenderer.invoke(IPC.rename, path, newName),
  move: (fromPath, toPath) => ipcRenderer.invoke(IPC.move, fromPath, toPath),
  trash: (path) => ipcRenderer.invoke(IPC.trash, path),
  renameFolder: (path, newName) => ipcRenderer.invoke(IPC.renameFolder, path, newName),
  moveFolder: (fromPath, toPath) => ipcRenderer.invoke(IPC.moveFolder, fromPath, toPath),
  trashFolder: (path) => ipcRenderer.invoke(IPC.trashFolder, path),
  restoreFromTrash: (trashPath, toPath) =>
    ipcRenderer.invoke(IPC.restoreFromTrash, trashPath, toPath),
  setOrder: (folder, orderedNames) => ipcRenderer.invoke(IPC.setOrder, folder, orderedNames),
  analyzeImport: (files) => ipcRenderer.invoke(IPC.analyzeImport, files),
  importFiles: (folder, files) => ipcRenderer.invoke(IPC.importFiles, folder, files),
  onImportStatus: (listener) => {
    const handler = (_event: unknown, status: ImportProgressStatus) => listener(status);
    ipcRenderer.on(IPC.importStatus, handler);
    return () => ipcRenderer.removeListener(IPC.importStatus, handler);
  },
  search: (query, limit) => ipcRenderer.invoke(IPC.search, query, limit),
  graph: (threshold) => ipcRenderer.invoke(IPC.graph, threshold),
  resolveLink: (target) => ipcRenderer.invoke(IPC.resolveLink, target),
  backlinks: (path) => ipcRenderer.invoke(IPC.backlinks, path),
  noteRefs: () => ipcRenderer.invoke(IPC.noteRefs),
  createNoteFromLink: (target) => ipcRenderer.invoke(IPC.createNoteFromLink, target),
  getDatabase: (folder) => ipcRenderer.invoke(IPC.getDatabase, folder),
  createDatabase: (folder) => ipcRenderer.invoke(IPC.createDatabase, folder),
  addProperty: (folder, name, type, options) =>
    ipcRenderer.invoke(IPC.addProperty, folder, name, type, options),
  setRowProperty: (folder, path, propertyId, value) =>
    ipcRenderer.invoke(IPC.setRowProperty, folder, path, propertyId, value),
  listRows: (folder) => ipcRenderer.invoke(IPC.listRows, folder),
  listDatabases: () => ipcRenderer.invoke(IPC.listDatabases),
  onVaultChange: (listener) => {
    const handler = (_event: unknown, change: VaultChangePayload) => listener(change);
    ipcRenderer.on(IPC.changed, handler);
    return () => ipcRenderer.removeListener(IPC.changed, handler);
  },
  onIndexStatus: (listener) => {
    const handler = (_event: unknown, status: IndexStatus) => listener(status);
    ipcRenderer.on(IPC.indexStatus, handler);
    return () => ipcRenderer.removeListener(IPC.indexStatus, handler);
  },
  onUpdateStatus: (listener) => {
    const handler = (_event: unknown, status: UpdateStatus) => listener(status);
    ipcRenderer.on(IPC.updateStatus, handler);
    return () => ipcRenderer.removeListener(IPC.updateStatus, handler);
  },
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  scanProviders: () => ipcRenderer.invoke(IPC.scanProviders),
  listModels: (kind) => ipcRenderer.invoke(IPC.listModels, kind),
  testProvider: () => ipcRenderer.invoke(IPC.testProvider),
  setEmbeddingSecret: (kind, secret) => ipcRenderer.invoke(IPC.setEmbeddingSecret, kind, secret),
  hasEmbeddingSecret: (kind) => ipcRenderer.invoke(IPC.hasEmbeddingSecret, kind),
  secretStorageAvailable: () => ipcRenderer.invoke(IPC.secretStorageAvailable),
  rebuildIndex: () => ipcRenderer.invoke(IPC.rebuildIndex),
  clearSemanticIndex: () => ipcRenderer.invoke(IPC.clearSemanticIndex),
  indexStats: () => ipcRenderer.invoke(IPC.indexStats),
  pauseIndexing: (paused) => ipcRenderer.invoke(IPC.pauseIndexing, paused),
  builtinModelReady: () => ipcRenderer.invoke(IPC.builtinModelReady),
  downloadBuiltinModel: () => ipcRenderer.invoke(IPC.downloadBuiltinModel),
  agentSkillStatus: () => ipcRenderer.invoke(IPC.agentSkillStatus),
  installAgentSkill: (id) => ipcRenderer.invoke(IPC.installAgentSkill, id),
  removeAgentSkill: (id) => ipcRenderer.invoke(IPC.removeAgentSkill, id),
  cliStatus: () => ipcRenderer.invoke(IPC.cliStatus),
  installCli: () => ipcRenderer.invoke(IPC.installCli),
  addCliToPath: () => ipcRenderer.invoke(IPC.addCliToPath),
  removeCli: () => ipcRenderer.invoke(IPC.removeCli),
  getRules: () => ipcRenderer.invoke(IPC.getRules),
  setRules: (text) => ipcRenderer.invoke(IPC.setRules, text),
};

contextBridge.exposeInMainWorld('vault', vault);
