/**
 * Shell-level E2E (E5 acceptance): drives the *built* `brain` binary as a child process against a
 * temp vault — create → search finds it → update → read reflects the update. Run via `test:e2e`,
 * which builds `dist/` first; excluded from the default `test` run.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initVault } from '@brain/core';
import { afterAll, beforeAll, expect, it } from 'vitest';

const binPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
let root: string;

function brain(...args: string[]): string {
  return execFileSync(process.execPath, [binPath, ...args, '--vault', root], {
    encoding: 'utf8',
    env: { ...process.env, BRAIN_EMBED: '' }, // force keyword-only (no provider) for a hermetic test
  });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'brain-cli-e2e-'));
  await initVault(root);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

it('drives the built binary: create → search → update → read', () => {
  expect(
    brain(
      'create',
      'Journal/Log.note.json',
      '--title',
      'Log',
      '--content',
      'shipped the vault core',
    ),
  ).toContain('Created');
  expect(brain('search', 'vault')).toContain('Journal/Log.note.json');
  brain('update', 'Journal/Log.note.json', '--content', 'now with mountains and peaks');
  expect(brain('read', 'Journal/Log.note.json')).toContain('mountains and peaks');
});
