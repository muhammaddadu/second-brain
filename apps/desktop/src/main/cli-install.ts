/**
 * Global `brain` command install: writes a tiny wrapper script into the user's bin directory that
 * runs the bundled CLI with this app's own runtime (`ELECTRON_RUN_AS_NODE`), so it works even
 * without a system Node. Status reports installed/outdated (paths changed, e.g. after an app
 * update) and whether the bin directory is on PATH so the owner knows if a shell tweak is needed.
 */
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { app } from 'electron';
import type { CliStatus } from '../shared/ipc.js';

const require = createRequire(import.meta.url);
const isWindows = process.platform === 'win32';

/** Where the wrapper goes: ~/.local/bin (POSIX convention, no sudo) / %USERPROFILE%\bin on Windows. */
function binDir(): string {
  return isWindows ? join(app.getPath('home'), 'bin') : join(app.getPath('home'), '.local', 'bin');
}

function wrapperPath(): string {
  return join(binDir(), isWindows ? 'brain.cmd' : 'brain');
}

/** Absolute path of the CLI entry (resolved from the workspace/app install, not hardcoded). */
function cliEntry(): string {
  return require.resolve('@brain/cli');
}

function renderWrapper(): string {
  const electron = process.execPath;
  const entry = cliEntry();
  if (isWindows) {
    return `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electron}" "${entry}" %*\r\n`;
  }
  return `#!/bin/sh\n# Installed by Second Brain (Settings → Agent access). Runs the brain CLI with the app's runtime.\nexport ELECTRON_RUN_AS_NODE=1\nexec "${electron}" "${entry}" "$@"\n`;
}

export async function cliStatus(): Promise<CliStatus> {
  const path = wrapperPath();
  let existing: string | null = null;
  try {
    existing = await readFile(path, 'utf8');
  } catch {
    existing = null;
  }
  const onPath = (process.env.PATH ?? '').split(delimiter).includes(binDir());
  return {
    installed: existing !== null,
    outdated: existing !== null && existing !== renderWrapper(),
    path,
    onPath,
  };
}

export async function installCli(): Promise<void> {
  await mkdir(binDir(), { recursive: true });
  await writeFile(wrapperPath(), renderWrapper(), 'utf8');
  if (!isWindows) await chmod(wrapperPath(), 0o755);
}

export async function removeCli(): Promise<void> {
  await rm(wrapperPath(), { force: true });
}
