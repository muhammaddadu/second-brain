import type { VaultApi } from '../../shared/ipc';

declare global {
  interface Window {
    /** Injected by the preload bridge; the renderer's only door to the vault. */
    vault: VaultApi;
  }
}
