import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addProperty,
  createDatabase,
  listRows,
  readDatabase,
  renameProperty,
  setRowProperty,
  validateValue,
} from './database.js';
import { exportNoteToMarkdown } from './import-export.js';
import { DATABASE_FILE } from './paths.js';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { createNote, openVault, readNote, updateNoteBlocks, type Vault } from './vault.js';

describe('databases (ADR 0004)', () => {
  let fixture: FixtureVault;
  let vault: Vault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
    vault = openVault(fixture.root);
    await createDatabase(vault, 'Tasks');
    await createNote(vault, 'Tasks/Ship it.note.json', { title: 'Ship it' });
    await createNote(vault, 'Tasks/Write docs.note.json', { title: 'Write docs' });
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('createDatabase writes a valid schema with a default table view (idempotent)', async () => {
    const raw = JSON.parse(await readFile(join(fixture.root, 'Tasks', DATABASE_FILE), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.views).toEqual([{ name: 'Table', type: 'table' }]);
    // Idempotent: creating again keeps the existing schema.
    await addProperty(vault, 'Tasks', {
      name: 'Status',
      type: 'select',
      options: ['Todo', 'Done'],
    });
    const again = await createDatabase(vault, 'Tasks');
    expect(again.properties).toHaveLength(1);
  });

  it('rename by stable id updates the schema without touching row files', async () => {
    const def = await addProperty(vault, 'Tasks', {
      name: 'Status',
      type: 'select',
      options: ['Todo', 'Done'],
    });
    await setRowProperty(vault, 'Tasks', 'Tasks/Ship it.note.json', def.id, 'Todo');
    const before = await readFile(join(fixture.root, 'Tasks/Ship it.note.json'), 'utf8');

    await renameProperty(vault, 'Tasks', def.id, 'State');
    const schema = await readDatabase(vault, 'Tasks');
    expect(schema?.properties[0]?.name).toBe('State');
    expect(schema?.properties[0]?.id).toBe(def.id); // id is stable
    const after = await readFile(join(fixture.root, 'Tasks/Ship it.note.json'), 'utf8');
    expect(after).toBe(before); // row file untouched by the rename
  });

  it('row values persist under meta.properties and survive body edits', async () => {
    const def = await addProperty(vault, 'Tasks', { name: 'Priority', type: 'number' });
    await setRowProperty(vault, 'Tasks', 'Tasks/Ship it.note.json', def.id, 2);

    await updateNoteBlocks(vault, 'Tasks/Ship it.note.json', [
      { type: 'paragraph', content: [{ type: 'text', text: 'edited body', styles: {} }] },
    ]);
    const note = await readNote(vault, 'Tasks/Ship it.note.json');
    expect(note.meta.properties?.[def.id]).toBe(2); // value survived the body edit
    expect(note.meta.title).toBe('Ship it');
  });

  it('validates values per type and clears with null', async () => {
    const num = { id: 'p1', name: 'N', type: 'number' as const };
    const sel = { id: 'p2', name: 'S', type: 'select' as const, options: ['a', 'b'] };
    const multi = { id: 'p3', name: 'M', type: 'multiSelect' as const, options: ['x', 'y'] };
    const check = { id: 'p4', name: 'C', type: 'checkbox' as const };
    const date = { id: 'p5', name: 'D', type: 'date' as const };

    expect(validateValue(num, '42')).toBe(42); // coerces numeric strings
    expect(() => validateValue(num, 'nope')).toThrow(/number/);
    expect(validateValue(sel, 'a')).toBe('a');
    expect(() => validateValue(sel, 'z')).toThrow(/one of/);
    expect(validateValue(multi, ['x'])).toEqual(['x']);
    expect(() => validateValue(multi, ['nope'])).toThrow(/unknown options/);
    expect(validateValue(check, true)).toBe(true);
    expect(() => validateValue(date, 'not-a-date')).toThrow(/date/);
    expect(validateValue(num, null)).toBeNull(); // null always clears

    const def = await addProperty(vault, 'Tasks', { name: 'Done', type: 'checkbox' });
    await setRowProperty(vault, 'Tasks', 'Tasks/Ship it.note.json', def.id, true);
    await setRowProperty(vault, 'Tasks', 'Tasks/Ship it.note.json', def.id, null);
    const note = await readNote(vault, 'Tasks/Ship it.note.json');
    expect(note.meta.properties?.[def.id]).toBeUndefined();
  });

  it('listRows returns the folder notes with titles and values (agent-created rows included)', async () => {
    const def = await addProperty(vault, 'Tasks', {
      name: 'Status',
      type: 'select',
      options: ['Todo', 'Done'],
    });
    await setRowProperty(vault, 'Tasks', 'Tasks/Ship it.note.json', def.id, 'Done');
    // Agent-style: create a row directly as a note with meta.properties — no bespoke API.
    await createNote(vault, 'Tasks/From agent.note.json', { title: 'From agent' });
    await setRowProperty(vault, 'Tasks', 'Tasks/From agent.note.json', def.id, 'Todo');

    const rows = await listRows(vault, 'Tasks');
    expect(rows.map((r) => r.title).sort()).toEqual(['From agent', 'Ship it', 'Write docs']);
    expect(rows.find((r) => r.title === 'Ship it')?.properties[def.id]).toBe('Done');
    expect(rows.find((r) => r.title === 'From agent')?.properties[def.id]).toBe('Todo');
  });

  it('exports a row with its properties as a readable header above the body', async () => {
    const def = await addProperty(vault, 'Tasks', {
      name: 'Status',
      type: 'select',
      options: ['Todo', 'Done'],
    });
    await setRowProperty(vault, 'Tasks', 'Tasks/Ship it.note.json', def.id, 'Todo');
    await updateNoteBlocks(vault, 'Tasks/Ship it.note.json', [
      { type: 'paragraph', content: [{ type: 'text', text: 'The plan.', styles: {} }] },
    ]);
    const markdown = await exportNoteToMarkdown(vault, 'Tasks/Ship it.note.json');
    expect(markdown).toContain('**Status**: Todo'); // property NAME, not the opaque id
    expect(markdown.indexOf('**Status**')).toBeLessThan(markdown.indexOf('The plan.'));
  });
});
