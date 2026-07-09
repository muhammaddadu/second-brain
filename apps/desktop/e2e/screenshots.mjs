/**
 * Launch the built app against a freshly-seeded starter vault and capture each surface as a PNG,
 * for a visual-polish pass. Not a test — run with `node e2e/screenshots.mjs <outDir>`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const outDir = process.argv[2] ?? join(tmpdir(), 'brain-shots');
const mainEntry = fileURLToPath(new URL('../out/main/index.js', import.meta.url));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const vaultRoot = await mkdtemp(join(tmpdir(), 'brain-shot-vault-'));
  const userData = await mkdtemp(join(tmpdir(), 'brain-shot-ud-'));
  // No BRAIN_VAULT → first-run welcome screen, so we can shoot onboarding too.
  const app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userData}`],
    env: { ...process.env, BRAIN_HOME: vaultRoot },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await wait(1200);

  const shot = async (name) => {
    await win.screenshot({ path: join(outDir, `${name}.png`) });
    process.stdout.write(`shot: ${name}\n`);
  };

  // 1. Onboarding / welcome.
  await shot('01-welcome');

  // Create a fresh vault (seeded starter content).
  await win.getByRole('button', { name: /create a new vault/i }).click();
  await wait(2000); // seed + first-note auto-open

  // 2. Main window (auto-opened first note).
  await shot('02-main-first-note');

  // 3. Expand a folder to show tree depth.
  try {
    await win.getByRole('button', { name: 'Guide', exact: true }).click();
    await wait(400);
    await shot('03-tree-expanded');
  } catch {}

  // 4. Search palette.
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await wait(400);
  await win.getByTestId('search-input').fill('local');
  await wait(700);
  await shot('04-search');
  await win.keyboard.press('Escape');
  await wait(300);

  // 5. Database (seeded Projects).
  try {
    await win.getByRole('button', { name: 'Projects', exact: true }).click();
    await wait(800);
    await shot('05-database-table');
    await win.getByTestId('board-toggle').click();
    await wait(600);
    await shot('06-database-board');
  } catch (e) {
    process.stdout.write(`database shot skipped: ${e}\n`);
  }

  // 7. Graph.
  try {
    await win.getByTestId('graph-button').click();
    await wait(1500);
    await shot('07-graph');
  } catch {}

  // 8. Settings.
  try {
    await win
      .getByRole('button', { name: /settings/i })
      .first()
      .click();
    await wait(700);
    await shot('08-settings');
  } catch {}

  await app.close();
  await rm(vaultRoot, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
}

main().catch((e) => {
  process.stderr.write(`${e}\n`);
  process.exit(1);
});
