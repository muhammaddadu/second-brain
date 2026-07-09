/**
 * Deep-link / open-to-page E2E: launching with `--route=settings` (how a CLI or a
 * `secondbrain://settings` link would open the app to a specific page) lands on the Settings page,
 * not the default note view. Proves the router + main→renderer navigate plumbing.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test';

const mainEntry = fileURLToPath(new URL('../out/main/index.js', import.meta.url));

let app: ElectronApplication;
let vaultRoot: string;
let userData: string;

test.beforeAll(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), 'brain-dl-'));
  userData = await mkdtemp(join(tmpdir(), 'brain-dl-ud-'));
  app = await electron.launch({
    args: [mainEntry, '--route=settings', `--user-data-dir=${userData}`],
    env: { ...process.env, BRAIN_VAULT: vaultRoot },
  });
});

test.afterAll(async () => {
  await app?.close();
  if (vaultRoot) await rm(vaultRoot, { recursive: true, force: true });
  if (userData) await rm(userData, { recursive: true, force: true });
});

test('launching with --route=settings opens directly to the Settings page', async () => {
  const window = await app.firstWindow();
  await expect(window.getByTestId('settings-page')).toBeVisible({ timeout: 8000 });
});
