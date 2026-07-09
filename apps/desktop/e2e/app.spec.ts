/**
 * E1/E2 E2E: launch the built Electron app against a fixture vault and drive the real
 * renderer→preload→IPC→core→disk path — navigate the tree, open a note, then edit it in BlockNote
 * and assert the edit persisted to the note file with metadata intact.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNote, importMarkdownAsNote, openVault, readNote, writeNote } from '@brain/core';
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from '@playwright/test';

const mainEntry = fileURLToPath(new URL('../out/main/index.js', import.meta.url));
const NOTE_PATH = 'Journal/2026-07-07.note.json';
const DIAGRAM_PATH = 'Diagrams/flow.note.json';
const BROKEN_PATH = 'Diagrams/broken.note.json';
const CODE_PATH = 'Code/snippet.note.json';

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

  // Agent-style: add a note containing a Mermaid diagram as Markdown, with no schema knowledge.
  await importMarkdownAsNote(vault, DIAGRAM_PATH, '```mermaid\ngraph TD; A-->B;\n```\n', {
    title: 'Flow',
  });
  // Invalid diagram source, and a code block in an unregistered language.
  await importMarkdownAsNote(vault, BROKEN_PATH, '```mermaid\nnot a valid diagram !!!\n```\n', {
    title: 'Broken',
  });
  await importMarkdownAsNote(vault, CODE_PATH, '```python\nprint("hi")\n```\n', {
    title: 'Snippet',
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

// Expand a folder only if it isn't already (folder state persists across tests in one window),
// then open a note under it.
async function openNote(folder: string, note: string) {
  const folderButton = window.getByRole('button', { name: folder });
  if ((await folderButton.getAttribute('aria-expanded')) !== 'true') {
    await folderButton.click();
  }
  await window.getByRole('button', { name: note }).click();
}

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

test('renders a Mermaid code block as a diagram and persists source edits', async () => {
  await openNote('Diagrams', 'flow');

  // The mermaid code block renders as a diagram (an SVG inside the preview).
  const preview = window.getByTestId('diagram-preview');
  await expect(preview.locator('svg')).toBeVisible({ timeout: 8000 });

  // Edit the source (the code block's editable text) and confirm it persists to disk.
  const source = window.getByTestId('diagram-source');
  await source.click();
  await window.keyboard.press('End');
  await window.keyboard.type(' C-->D;');

  const diagramFile = join(vaultRoot, DIAGRAM_PATH);
  await expect
    .poll(async () => JSON.stringify(JSON.parse(await readFile(diagramFile, 'utf8')).blocks), {
      timeout: 8000,
    })
    .toContain('C-->D');

  const parsed = JSON.parse(await readFile(diagramFile, 'utf8'));
  expect(parsed.blocks[0].type).toBe('codeBlock'); // still stored as a code block
  expect(parsed.blocks[0].props.language).toBe('mermaid');
});

test('invalid diagram source shows an error with the source intact', async () => {
  await openNote('Diagrams', 'broken');

  await expect(window.getByTestId('diagram-error')).toBeVisible({ timeout: 8000 });
  // Source is not destroyed — still shown and editable.
  await expect(window.getByTestId('diagram-source')).toContainText('not a valid diagram');
});

test('a code block in an unregistered language renders as plain code, not a diagram', async () => {
  await openNote('Code', 'snippet');

  await expect(window.getByText('print("hi")')).toBeVisible();
  await expect(window.getByTestId('diagram-preview')).toHaveCount(0);
  await expect(window.getByTestId('diagram-block')).toHaveCount(0);
});
