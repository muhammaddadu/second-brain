/**
 * Global `brain` command install: writes a tiny wrapper script into the user's bin directory that
 * runs the bundled CLI with this app's own runtime (`ELECTRON_RUN_AS_NODE`), so it works even
 * without a system Node. Status reports installed/outdated (paths changed, e.g. after an app
 * update) and whether the bin directory is on PATH so the owner knows if a shell tweak is needed.
 */
import { appendFile, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, delimiter, join } from 'node:path';
import { app } from 'electron';
import type { CliStatus } from '../shared/ipc.js';

const require = createRequire(import.meta.url);
const isWindows = process.platform === 'win32';
// Marks the block we add to a shell profile, so we configure PATH exactly once and can find it.
const PATH_MARKER = '# Added by Second Brain — makes the `brain` command available';

/** Where the wrapper goes: ~/.local/bin (POSIX convention, no sudo) / %USERPROFILE%\bin on Windows. */
function binDir(): string {
  return isWindows ? join(app.getPath('home'), 'bin') : join(app.getPath('home'), '.local', 'bin');
}

/** The shell profile to configure and the line that puts {@link binDir} on PATH, per the user's shell. */
function shellProfile(): { file: string; line: string; shell: string } {
  const home = app.getPath('home');
  const shell = basename(process.env.SHELL ?? 'zsh');
  if (shell === 'fish') {
    return {
      file: join(home, '.config', 'fish', 'config.fish'),
      line: 'fish_add_path "$HOME/.local/bin"',
      shell,
    };
  }
  const file = shell === 'bash' ? join(home, '.bashrc') : join(home, '.zshrc');
  return { file, line: 'export PATH="$HOME/.local/bin:$PATH"', shell };
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

/** True once binDir is on the live PATH or already written into the user's shell profile. */
async function isOnPath(): Promise<boolean> {
  if ((process.env.PATH ?? '').split(delimiter).includes(binDir())) return true;
  if (isWindows) return false; // Windows PATH is registry-based; we don't auto-edit it.
  return (await readOrEmpty(shellProfile().file)).includes(PATH_MARKER);
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
  const existing = await readOrEmpty(path);
  return {
    installed: existing !== '',
    outdated: existing !== '' && existing !== renderWrapper(),
    path,
    onPath: await isOnPath(),
    // The profile we'd configure, so the UI can name it ("Added to ~/.zshrc"). Windows: no auto-edit.
    ...(isWindows ? {} : { shellProfile: shellProfile().file }),
  };
}

export async function installCli(): Promise<void> {
  await mkdir(binDir(), { recursive: true });
  await writeFile(wrapperPath(), renderWrapper(), 'utf8');
  if (!isWindows) await chmod(wrapperPath(), 0o755);
}

/**
 * Put {@link binDir} on PATH for the user's shell by appending a marked block to their profile —
 * so `brain` works in a new terminal without the owner hand-editing dotfiles. Idempotent. Returns
 * the profile path. Throws on Windows (PATH there is registry-based; we surface manual guidance).
 */
export async function addCliToPath(): Promise<{ shellProfile: string }> {
  if (isWindows)
    throw new Error('On Windows, add %USERPROFILE%\\bin to your PATH in System settings.');
  const { file, line } = shellProfile();
  const current = await readOrEmpty(file);
  if (!current.includes(PATH_MARKER)) {
    await mkdir(join(file, '..'), { recursive: true });
    const prefix = current === '' || current.endsWith('\n') ? '' : '\n';
    await appendFile(file, `${prefix}\n${PATH_MARKER}\n${line}\n`);
  }
  return { shellProfile: file };
}

export async function removeCli(): Promise<void> {
  await rm(wrapperPath(), { force: true });
}
