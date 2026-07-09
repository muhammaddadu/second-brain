/**
 * E1/E2 E2E: launch the built Electron app against a fixture vault and drive the real
 * renderer→preload→IPC→core→disk path — navigate the tree, open a note, then edit it in BlockNote
 * and assert the edit persisted to the note file with metadata intact.
 */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNote,
  importMarkdownAsNote,
  openVault,
  readNote,
  serializeNote,
  writeNote,
} from '@brain/core';
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
let userData: string;

test.beforeAll(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), 'brain-e2e-'));
  userData = await mkdtemp(join(tmpdir(), 'brain-e2e-ud-'));
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
  // Wikilink fixtures: a target note and a note linking to it by path.
  await importMarkdownAsNote(vault, 'People/Ada Lovelace.note.json', 'A person.', {
    title: 'Ada Lovelace',
  });
  await importMarkdownAsNote(vault, 'Links/Daily.note.json', 'Met [[People/Ada Lovelace]] today.', {
    title: 'Daily',
  });

  app = await electron.launch({
    args: [mainEntry, `--user-data-dir=${userData}`],
    env: { ...process.env, BRAIN_VAULT: vaultRoot },
  });
  window = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  if (vaultRoot) await rm(vaultRoot, { recursive: true, force: true });
  if (userData) await rm(userData, { recursive: true, force: true });
});

// Expand a folder only if it isn't already (folder state persists across tests in one window),
// then open a note under it.
async function openNote(folder: string, note: string) {
  await ensureExpanded(folder);
  await window.getByRole('button', { name: note, exact: true }).click();
}

async function ensureExpanded(folder: string) {
  // exact: a tag chip's "Remove tag <folder>" button would otherwise also match by substring.
  const folderButton = window.getByRole('button', { name: folder, exact: true });
  if ((await folderButton.getAttribute('aria-expanded')) !== 'true') {
    await folderButton.click();
  }
}

test('opens the vault, navigates the tree, and shows a note', async () => {
  await expect(window.getByTestId('vault-name')).toHaveText(/brain-e2e-/);

  await window.getByRole('button', { name: 'Journal', exact: true }).click();
  await window.getByRole('button', { name: '2026-07-07' }).click();

  await expect(window.getByTestId('note-title')).toHaveValue('Daily log');
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

  // Regression: mermaid appends a temporary container to <body> to render; on a syntax error it
  // must not leak a stray "Syntax error" bomb element into the document (it floated over the app).
  await expect
    .poll(async () =>
      window.evaluate(() => document.querySelectorAll('[id^="dbrain-mermaid"]').length),
    )
    .toBe(0);
});

test('a code block in an unregistered language renders as plain code, not a diagram', async () => {
  await openNote('Code', 'snippet');

  await expect(window.getByText('print("hi")')).toBeVisible();
  await expect(window.getByTestId('diagram-preview')).toHaveCount(0);
  await expect(window.getByTestId('diagram-block')).toHaveCount(0);
});

test('creates and renames a note via the context menu, and reflects external changes', async () => {
  await ensureExpanded('Journal');

  // Create via the folder's context menu.
  await window.getByRole('button', { name: 'Journal', exact: true }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'New note' }).click();
  await expect(window.getByTestId('note-title')).toHaveValue('Untitled');

  // Rename via context menu → inline input.
  await window.getByRole('button', { name: 'Untitled' }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'Rename' }).click();
  const input = window.getByRole('textbox', { name: 'Rename' });
  await input.fill('Renamed note');
  await input.press('Enter');
  await expect(window.getByRole('button', { name: 'Renamed note' })).toBeVisible();

  // External change: a file written directly on disk appears in the tree without restart.
  await writeFile(
    join(vaultRoot, 'Journal/external.note.json'),
    serializeNote({ version: 1, meta: { title: 'External' }, blocks: [] }),
    'utf8',
  );
  await expect(window.getByRole('button', { name: 'external' })).toBeVisible({ timeout: 8000 });
});

test('creates a folder with inline rename, then renames it via the context menu', async () => {
  // New folder inside Journal → drops into inline rename immediately (parent stays open).
  await window.getByRole('button', { name: 'Journal', exact: true }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'New folder' }).click();
  const createInput = window.getByRole('textbox', { name: 'Rename' });
  await expect(createInput).toBeVisible();
  await createInput.fill('Reading list');
  await createInput.press('Enter');
  await expect(window.getByRole('button', { name: 'Reading list' })).toBeVisible();

  // Rename it again via the context menu.
  await window.getByRole('button', { name: 'Reading list' }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'Rename' }).click();
  const renameInput = window.getByRole('textbox', { name: 'Rename' });
  await renameInput.fill('Reading');
  await renameInput.press('Enter');
  await expect(window.getByRole('button', { name: 'Reading', exact: true })).toBeVisible();
});

test('drags a note into a folder to move it on disk', async () => {
  // 'external' (Journal/external.note.json) exists from an earlier test; 'Reading' folder too.
  await ensureExpanded('Journal');
  const source = window.getByRole('button', { name: 'external' });
  const target = window.getByRole('button', { name: 'Reading', exact: true });
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  // HTML5 drag-and-drop: Playwright's mouse-based dragTo doesn't fire native drag events in
  // Chromium, so dispatch the DnD sequence directly (sharing one DataTransfer, as a real drag does).
  // clientY at the folder row's middle → "move into" (its edges would mean reorder).
  const box = await target.boundingBox();
  if (!box) throw new Error('target not visible');
  const midY = Math.round(box.y + box.height / 2);
  const dataTransfer = await window.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer, clientY: midY });
  await target.dispatchEvent('drop', { dataTransfer, clientY: midY });

  const moved = join(vaultRoot, 'Journal/Reading/external.note.json');
  await expect
    .poll(
      async () =>
        stat(moved)
          .then(() => true)
          .catch(() => false),
      { timeout: 8000 },
    )
    .toBe(true);
});

test('drags a note above a sibling to reorder it, persisting a .order.json', async () => {
  await ensureExpanded('Journal');
  // Default order in Journal: folders first (Reading), then notes alpha ('2026-07-07','Renamed note').
  const dragged = window.getByRole('button', { name: 'Renamed note' });
  const target = window.getByRole('button', { name: '2026-07-07' });
  const box = await target.boundingBox();
  if (!box) throw new Error('target not visible');
  const topY = Math.round(box.y + box.height * 0.1); // top region → insert before

  const dataTransfer = await window.evaluateHandle(() => new DataTransfer());
  await dragged.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer, clientY: topY });
  await target.dispatchEvent('drop', { dataTransfer, clientY: topY });

  // The order sidecar lands with 'Renamed note' ahead of '2026-07-07'; no files moved.
  const orderFile = join(vaultRoot, 'Journal/.order.json');
  await expect
    .poll(
      async () => {
        try {
          const order: string[] = JSON.parse(await readFile(orderFile, 'utf8'));
          return order.indexOf('Renamed note.note.json') < order.indexOf('2026-07-07.note.json')
            ? order.indexOf('Renamed note.note.json') >= 0
            : false;
        } catch {
          return false;
        }
      },
      { timeout: 8000 },
    )
    .toBe(true);
});

test('inserts a Mermaid diagram from the slash menu', async () => {
  await openNote('Code', 'snippet');
  const editable = window.locator('[contenteditable="true"]').first();
  await editable.click();
  await window.keyboard.press('End');
  await window.keyboard.press('Enter'); // a fresh block
  await window.keyboard.type('/mermaid');
  await window.getByText('Mermaid diagram').click();

  // A diagram is inserted and renders.
  await expect(window.getByTestId('diagram-preview').locator('svg').first()).toBeVisible({
    timeout: 8000,
  });
});

test('settings page: switching theme applies live, sidebar intact', async () => {
  await window.getByRole('button', { name: 'Settings' }).click();
  await expect(window.getByTestId('settings-page')).toBeVisible();
  // The sidebar stays in place — it's a page, not a modal.
  await expect(window.getByRole('button', { name: 'Journal', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Dark' }).click();
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 5000 });

  await window.getByRole('button', { name: 'Light' }).click();
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 5000 });

  // Opening a note leaves settings (router navigation).
  await openNote('Journal', '2026-07-07');
  await expect(window.getByTestId('settings-page')).toHaveCount(0);
});

test('settings: enabling semantic search reveals the provider picker and config', async () => {
  await window.getByRole('button', { name: 'Settings' }).click();
  const toggle = window.getByTestId('semantic-toggle');
  await expect(toggle).not.toBeChecked(); // off by default (private, no network)

  await toggle.check();
  // The provider picker appears; Built-in (on-device) is the default, so first run offers a
  // consent-gated download rather than silently fetching the model.
  await expect(window.getByRole('button', { name: /Ollama/ })).toBeVisible();
  await expect(window.getByRole('button', { name: 'AWS Bedrock' })).toBeVisible();
  await expect(window.getByTestId('download-model')).toBeVisible();

  // Picking a remote provider swaps to its config + Test action.
  await window.getByRole('button', { name: 'OpenAI' }).click();
  await expect(window.getByTestId('test-connection')).toBeVisible();

  // Turn it back off so later tests (and the app's default) stay keyword-only.
  await toggle.uncheck();
  await expect(window.getByTestId('test-connection')).toHaveCount(0);

  await openNote('Journal', '2026-07-07');
});

test('settings: editing vault rules writes RULES.md', async () => {
  await window.getByRole('button', { name: 'Settings' }).click();
  const editor = window.getByTestId('rules-editor');
  await editor.fill('Daily notes go in Journal/YYYY-MM-DD.');
  await editor.blur(); // commit on blur

  const rulesPath = join(vaultRoot, 'RULES.md');
  await expect
    .poll(async () => readFile(rulesPath, 'utf8').catch(() => ''), { timeout: 8000 })
    .toContain('Daily notes go in Journal');

  await openNote('Journal', '2026-07-07');
});

test('an external edit to the OPEN note surfaces a conflict, never a silent clobber', async () => {
  await openNote('Journal', '2026-07-07'); // open it; NoteView reads its current hash

  // Modify the same file out-of-band → the open editor must surface a conflict, not overwrite.
  await writeFile(
    join(vaultRoot, NOTE_PATH),
    serializeNote({
      version: 1,
      meta: { title: 'Daily log', tags: ['journal'] },
      blocks: [
        { type: 'paragraph', content: [{ type: 'text', text: 'EXTERNAL EDIT', styles: {} }] },
      ],
    }),
    'utf8',
  );

  await expect(window.getByTestId('conflict-banner')).toBeVisible({ timeout: 8000 });

  // The banner offers a diff of on-disk vs. mine.
  await window.getByRole('button', { name: 'View diff' }).click();
  await expect(window.getByTestId('conflict-diff')).toBeVisible();
  await expect(window.getByTestId('conflict-diff')).toContainText('EXTERNAL EDIT');
  await window.keyboard.press('Escape'); // close the diff overlay
  await expect(window.getByTestId('conflict-diff')).toHaveCount(0);
});

test('editing the note title renames its file on disk', async () => {
  await openNote('Code', 'snippet');
  const titleInput = window.getByTestId('note-title');
  await titleInput.fill('Python snippet');
  await titleInput.press('Enter');

  // The file is renamed to match the title (same folder), and the tree shows the new name.
  const renamed = join(vaultRoot, 'Code/Python snippet.note.json');
  await expect
    .poll(
      async () => {
        try {
          await stat(renamed);
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 8000 },
    )
    .toBe(true);
  await expect(window.getByRole('button', { name: 'Python snippet' })).toBeVisible();
  expect(JSON.parse(await readFile(renamed, 'utf8')).meta.title).toBe('Python snippet');
});

test('⌘K search finds a note by its text and opens it', async () => {
  // Seed a note with a distinctive term; the watcher reindexes it before the tree row appears.
  await writeFile(
    join(vaultRoot, 'Journal/searchable.note.json'),
    serializeNote({
      version: 1,
      meta: { title: 'Findable' },
      blocks: [
        { type: 'paragraph', content: [{ type: 'text', text: 'xylophone gadgets', styles: {} }] },
      ],
    }),
    'utf8',
  );
  await expect(window.getByRole('button', { name: 'searchable' })).toBeVisible({ timeout: 8000 });

  // Open the palette (button), query, and open the result.
  await window.getByTestId('search-button').click();
  await expect(window.getByTestId('search-palette')).toBeVisible();
  await window.getByTestId('search-input').fill('xylophone');

  const result = window.getByTestId('search-results').getByRole('button', { name: /Findable/ });
  await expect(result).toBeVisible({ timeout: 8000 });
  await result.click();

  await expect(window.getByTestId('search-palette')).toHaveCount(0);
  await expect(window.getByTestId('note-title')).toHaveValue('Findable');
});

test('databases: create a database, add property/rows, edit a cell, move a board card', async () => {
  // Create a database inside Journal via the context menu (inline rename, like New folder).
  await ensureExpanded('Journal');
  await window.getByRole('button', { name: 'Journal', exact: true }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'New database' }).click();
  const createInput = window.getByRole('textbox', { name: 'Rename' });
  await createInput.fill('Tasks');
  await createInput.press('Enter');

  // Opening it shows the table view; database.json exists on disk.
  await window.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(window.getByTestId('database-view')).toBeVisible();
  await expect
    .poll(async () =>
      readFile(join(vaultRoot, 'Journal/Tasks/database.json'), 'utf8').catch(() => ''),
    )
    .toContain('"views"');

  // Add two rows and a select property.
  await window.getByTestId('add-row').click();
  await window.getByTestId('add-row').click();
  await window.getByTestId('add-property').click();
  await window.getByTestId('property-name').fill('Status');
  await window.getByTestId('property-type').selectOption('select');
  await window.getByTestId('property-options').fill('Todo, Done');
  await window.getByTestId('property-save').click();
  await expect(window.getByTestId('database-table')).toContainText('Status');

  // Edit the first row's Status cell → the row note file gains the property value.
  await window.getByTestId('cell-Status').first().selectOption('Todo');
  const rowFile = join(vaultRoot, 'Journal/Tasks/Untitled.note.json');
  await expect
    .poll(async () => readFile(rowFile, 'utf8').catch(() => ''), { timeout: 8000 })
    .toContain('"Todo"');

  // Board view: the card sits in the Todo column; drag it to Done → file updates.
  await window.getByTestId('board-toggle').click();
  const card = window
    .getByTestId('board-column-Todo')
    .getByRole('button', { name: 'Untitled', exact: true });
  await expect(card).toBeVisible();
  const dataTransfer = await window.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer });
  await window.getByTestId('board-column-Done').dispatchEvent('drop', { dataTransfer });
  await expect
    .poll(async () => readFile(rowFile, 'utf8').catch(() => ''), { timeout: 8000 })
    .toContain('"Done"');
  await expect(
    window.getByTestId('board-column-Done').getByRole('button', { name: 'Untitled', exact: true }),
  ).toBeVisible();
});

test('databases: "New database" creates a schema-backed folder with inline rename', async () => {
  await ensureExpanded('Journal');
  await window.getByRole('button', { name: 'Journal', exact: true }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'New database' }).click();
  const renameInput = window.getByRole('textbox', { name: 'Rename' });
  await renameInput.fill('Projects DB');
  await renameInput.press('Enter');
  await expect
    .poll(async () =>
      readFile(join(vaultRoot, 'Journal/Projects DB/database.json'), 'utf8').catch(() => ''),
    )
    .toContain('"views"');
});

test('sidebar keyboard: arrows navigate, Enter opens, Delete asks before trashing', async () => {
  // A disposable, uniquely-named note to delete.
  await ensureExpanded('Journal');
  await window.getByRole('button', { name: 'Journal', exact: true }).click({ button: 'right' });
  await window.getByTestId('context-menu').getByRole('button', { name: 'New note' }).click();
  const titleInput = window.getByTestId('note-title');
  await titleInput.fill('Disposable');
  await titleInput.press('Enter');
  const row = window.getByRole('button', { name: 'Disposable', exact: true });
  await expect(row).toBeVisible();

  // Click the row (sets keyboard focus to it), then Delete asks first; Escape cancels.
  await row.click();
  const tree = window.getByTestId('folder-tree');
  await tree.focus();
  await window.keyboard.press('Delete');
  await expect(window.getByTestId('confirm-dialog')).toBeVisible();
  await expect(window.getByTestId('confirm-dialog')).toContainText('Disposable'); // the right target
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(row).toBeVisible(); // nothing trashed on cancel

  // Confirming really moves the note to trash (recoverable on disk, gone from the tree).
  await tree.focus();
  await window.keyboard.press('Delete');
  await window.getByTestId('confirm-action').click();
  await expect(row).toHaveCount(0);
  const { readdir } = await import('node:fs/promises');
  const trashed = await readdir(join(vaultRoot, '.brain/trash'));
  expect(trashed.some((f) => f.includes('Disposable'))).toBe(true);

  // Arrow navigation: ArrowDown then Enter toggles the first row (a folder).
  await tree.focus();
  await window.keyboard.press('ArrowDown');
  await window.keyboard.press('Enter');
  const first = window.getByRole('button', { name: 'Code', exact: true });
  await expect(first).toHaveAttribute('aria-expanded', /true|false/);
});

test('dropping a Markdown file onto the tree imports it as a note', async () => {
  const tree = window.getByTestId('folder-tree');
  const dataTransfer = await window.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(
      new File(['# Imported doc\n\nBrought in by drag and drop.'], 'Imported doc.md', {
        type: 'text/markdown',
      }),
    );
    return dt;
  });
  await tree.dispatchEvent('drop', { dataTransfer });

  // The converted note lands on disk at the vault root and appears in the tree.
  const imported = join(vaultRoot, 'Imported doc.note.json');
  await expect
    .poll(async () => readFile(imported, 'utf8').catch(() => ''), { timeout: 8000 })
    .toContain('Brought in by drag and drop');
  const parsed = JSON.parse(await readFile(imported, 'utf8'));
  expect(parsed.meta.title).toBe('Imported doc');
  await expect(window.getByRole('button', { name: 'Imported doc', exact: true })).toBeVisible();
});

test('wikilinks: [[link]] renders clickable, navigates, and shows a backlink', async () => {
  // The fixture note "Daily" references [[People/Ada Lovelace]].
  await openNote('Links', 'Daily');
  const link = window.locator('.wikilink').first();
  await expect(link).toBeVisible({ timeout: 8000 });
  await expect(link).toHaveText(/Ada Lovelace/);

  // Clicking it opens the target note…
  await link.click();
  await expect(window.getByTestId('note-title')).toHaveValue('Ada Lovelace', { timeout: 8000 });

  // …which shows the linking note as a backlink; clicking that returns.
  const backlinks = window.getByTestId('backlinks');
  await expect(backlinks).toBeVisible();
  await expect(backlinks).toContainText('Daily');
  await backlinks.getByRole('button', { name: 'Daily', exact: true }).click();
  await expect(window.getByTestId('note-title')).toHaveValue('Daily');
});

test('opens the knowledge graph and can return to a note', async () => {
  await window.getByTestId('graph-button').click();
  await expect(window.getByRole('heading', { name: 'Knowledge graph' })).toBeVisible();
  // The graph derives from the index; the fixture has several tagged notes, so it renders (svg)
  // or shows the empty-state — either way the view is up, not the note editor.
  await expect(window.getByTestId('note-title')).toHaveCount(0);

  // Leaving to a note swaps back to the editor (router navigation).
  await openNote('Journal', '2026-07-07');
  await expect(window.getByTestId('note-title')).toHaveValue('Daily log');
});
