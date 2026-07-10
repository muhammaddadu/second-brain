/**
 * Auto-update (electron-updater). Packaged builds check their environment's channel (baked into
 * app-update.yml by electron-builder's per-env publish config — see build/environments.cjs) for a
 * newer release, download it in the background, and tell the renderer when it's ready so the owner
 * can restart on their own terms. No silent restarts. A no-op in dev (nothing to update) and until
 * a real `publish.owner` + published release exist. Thin: events in, status broadcast out.
 */
import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { IPC, type UpdateStatus } from '../shared/ipc';

const { autoUpdater } = electronUpdater;

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateStatus, status);
}

let wired = false;

/** Wire electron-updater's events to a renderer-friendly status, and kick off a first check. */
export function initAutoUpdate(): void {
  if (!app.isPackaged || wired) return; // dev runs from source — there's nothing to update
  wired = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // if they don't click Restart, it lands on next quit

  autoUpdater.on('update-available', (info) =>
    broadcast({ state: 'available', version: info.version }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'ready', version: info.version }),
  );
  autoUpdater.on('error', (err) => {
    // Never surface an update failure as a crash; log and stay idle (offline, no release yet, etc.).
    console.error('auto-update error', err);
    broadcast({ state: 'idle' });
  });

  void checkForUpdates();
}

/** Check now (safe to call anytime; no-op in dev). Errors are swallowed to the error handler above. */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('checkForUpdates failed', error);
  }
}

/** Quit and install a downloaded update (the renderer's "Restart" button). */
export function installUpdate(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}
