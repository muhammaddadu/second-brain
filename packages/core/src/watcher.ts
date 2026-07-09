/**
 * Vault file watcher. Per ADR 0002, every surface watches the vault and refreshes on change, so
 * an external write (agent via CLI/MCP, a git pull, another editor) shows up without a restart.
 * Emits vault-relative POSIX paths; ignores the reserved {@link BRAIN_DIR}. Uses chokidar for
 * reliable cross-platform recursive watching behind this thin interface.
 */
import { relative, sep } from 'node:path';
import chokidar from 'chokidar';
import { BRAIN_DIR } from './paths.js';
import type { Vault } from './vault.js';

export type VaultEventType = 'add' | 'change' | 'unlink';

export interface VaultChange {
  type: VaultEventType;
  /** Vault-relative, POSIX-separated path of the file that changed. */
  path: string;
}

export interface VaultWatcher {
  close(): Promise<void>;
}

/** Convert an absolute path under the vault to a vault-relative POSIX path. */
export function toVaultRelative(vaultRoot: string, absPath: string): string {
  return relative(vaultRoot, absPath).split(sep).join('/');
}

/** Whether an absolute path is inside the reserved {@link BRAIN_DIR} (and so ignored). */
export function isReservedPath(vaultRoot: string, absPath: string): boolean {
  const rel = relative(vaultRoot, absPath);
  return rel === BRAIN_DIR || rel.startsWith(`${BRAIN_DIR}${sep}`);
}

/** Start watching a vault. Call {@link VaultWatcher.close} to stop. */
export function watchVault(vault: Vault, onChange: (change: VaultChange) => void): VaultWatcher {
  const watcher = chokidar.watch(vault.root, {
    ignoreInitial: true,
    ignored: (path: string) => isReservedPath(vault.root, path),
  });

  const forward = (type: VaultEventType) => (absPath: string) => {
    onChange({ type, path: toVaultRelative(vault.root, absPath) });
  };

  watcher.on('add', forward('add')).on('change', forward('change')).on('unlink', forward('unlink'));
  // Without an 'error' listener chokidar rethrows (e.g. if the vault dir is deleted while open),
  // which would crash the host process. Swallow — the surface refreshes from disk on next read.
  watcher.on('error', () => {});

  return { close: () => watcher.close() };
}
