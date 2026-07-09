/**
 * E1 E2E: launch the built Electron app against a fixture vault, expand a folder, click a note,
 * and assert its content is visible — proving the full renderer→preload→IPC→core→disk path.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNote, openVault, readNote, writeNote } from '@brain/core';
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
let vaultRoot: string;

test.beforeAll(async () => {
  // Seed a throwaway vault with one note that has a title, a tag, and body text.
  vaultRoot = await mkdtemp(join(tmpdir(), 'brain-e2e-'));
  const vault = openVault(vaultRoot);
  await createNote(vault, 'Journal/2026-07-07.note.json', {
    title: 'Daily log',
    tags: ['journal'],
  });
  const note = await readNote(vault, 'Journal/2026-07-07.note.json');
  await writeNote(vault, 'Journal/2026-07-07.note.json', {
    ...note,
    blocks: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Shipped the vault core.', styles: {} }],
      },
    ],
  });

  app = await electron.launch({
    args: [mainEntry],
    env: { ...process.env, BRAIN_VAULT: vaultRoot },
  });
  window = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  if (vaultRoot) await rm(vaultRoot, { recursive: true, force: true });
});

test('opens the vault, navigates the tree, and shows a note', async () => {
  // Header shows the vault folder name.
  await expect(window.getByTestId('vault-name')).toHaveText(/brain-e2e-/);

  // Expand the folder, then click the note.
  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: '2026-07-07' }).click();

  // The note's title and body are visible.
  await expect(window.getByTestId('note-title')).toHaveText('Daily log');
  await expect(window.getByText('Shipped the vault core.')).toBeVisible();
});
