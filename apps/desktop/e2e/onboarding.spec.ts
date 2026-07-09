/**
 * First-run onboarding E2E: launch with no BRAIN_VAULT (and an isolated user-data dir so no recent
 * vaults leak in), assert the welcome screen, create a fresh vault in one click, and verify the
 * app opens it and the vault was really created on disk with its marker.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from '@playwright/test';

const mainEntry = fileURLToPath(new URL('../out/main/index.js', import.meta.url));

let app: ElectronApplication;
let window: Page;
let home: string;
let userData: string;

test.beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'brain-home-'));
  userData = await mkdtemp(join(tmpdir(), 'brain-userdata-'));
  const env = { ...process.env, BRAIN_HOME: home };
  env.BRAIN_VAULT = undefined; // force the setup path even if the outer env set one
  app = await electron.launch({ args: [mainEntry, `--user-data-dir=${userData}`], env });
  window = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  if (home) await rm(home, { recursive: true, force: true });
  if (userData) await rm(userData, { recursive: true, force: true });
});

test('first run shows the welcome screen and creates a fresh vault', async () => {
  await expect(window.getByText('Welcome to Second Brain')).toBeVisible();

  await window.getByTestId('create-vault').click();

  // The workspace opens on the new vault…
  await expect(window.getByTestId('vault-name')).toHaveText('Second Brain', { timeout: 8000 });
  // …which was really created on disk, marked as a vault, and starts empty.
  await stat(join(home, 'Second Brain', '.brain', 'vault.json'));
  await expect(window.getByText('Your vault is empty.')).toBeVisible();
});
