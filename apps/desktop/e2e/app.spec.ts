/**
 * E1/E2 E2E: launch the built Electron app against a fixture vault and drive the real
 * renderer→preload→IPC→core→disk path — navigate the tree, open a note, then edit it in BlockNote
 * and assert the edit persisted to the note file with metadata intact.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
const NOTE_PATH = 'Journal/2026-07-07.note.json';

let app: ElectronApplication;
let window: Page;
let vaultRoot: string;

test.beforeAll(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), 'brain-e2e-'));
  const vault = openVault(vaultRoot);
  await createNote(vault, NOTE_PATH, { title: 'Daily log', tags: ['journal'] });
  const note = await readNote(vault, NOTE_PATH);
  await writeNote(vault, NOTE_PATH, {
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
  await expect(window.getByTestId('vault-name')).toHaveText(/brain-e2e-/);

  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: '2026-07-07' }).click();

  await expect(window.getByTestId('note-title')).toHaveText('Daily log');
  await expect(window.getByText('Shipped the vault core.')).toBeVisible();
});

test('edits in the editor persist to the note file, metadata intact', async () => {
  await window.getByRole('button', { name: '2026-07-07' }).click();

  // Place the cursor in the existing paragraph and append text.
  await window.getByText('Shipped the vault core.').click();
  await window.keyboard.press('End');
  await window.keyboard.type(' edited-in-e2e');

  const notePath = join(vaultRoot, NOTE_PATH);

  // Autosave is debounced (~600ms); poll the real file until the edit lands.
  await expect
    .poll(async () => JSON.stringify(JSON.parse(await readFile(notePath, 'utf8')).blocks), {
      timeout: 8000,
    })
    .toContain('edited-in-e2e');

  const parsed = JSON.parse(await readFile(notePath, 'utf8'));
  expect(parsed.version).toBe(1); // envelope still valid
  expect(parsed.meta.title).toBe('Daily log'); // metadata untouched
  expect(parsed.meta.tags).toEqual(['journal']);
});
