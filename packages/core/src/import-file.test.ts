import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportNoteToMarkdown } from './import-export.js';
import { importFileAsNote } from './import-file.js';
import { blocksToText } from './search.js';
import { initVault, openVault, readNote, type Vault } from './vault.js';

const encode = (s: string) => new TextEncoder().encode(s);

describe('importFileAsNote', () => {
  let root: string;
  let vault: Vault;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-import-'));
    await initVault(root);
    vault = openVault(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('imports a Markdown file: title from the filename, structure preserved', async () => {
    const result = await importFileAsNote(
      vault,
      'Inbox',
      'Meeting notes.md',
      encode('# Agenda\n\n- item one\n- item two\n'),
    );
    expect(result).toMatchObject({ ok: true, path: 'Inbox/Meeting notes.note.json' });
    if (!result.ok) throw new Error('unreachable');
    const note = await readNote(vault, result.path);
    expect(note.meta.title).toBe('Meeting notes');
    const text = blocksToText(note.blocks);
    expect(text).toContain('Agenda');
    expect(text).toContain('item two');
  });

  it('imports plain text and de-duplicates colliding names', async () => {
    const first = await importFileAsNote(vault, '', 'log.txt', encode('first'));
    const second = await importFileAsNote(vault, '', 'log.txt', encode('second'));
    expect(first).toMatchObject({ ok: true, path: 'log.note.json' });
    expect(second).toMatchObject({ ok: true, path: 'log 1.note.json' }); // never overwrites
  });

  it('rejects unsupported and legacy formats with a plain-language reason', async () => {
    const doc = await importFileAsNote(vault, '', 'old.doc', encode('x'));
    expect(doc).toMatchObject({ ok: false });
    if (doc.ok) throw new Error('unreachable');
    expect(doc.reason).toMatch(/docx/i);

    const zip = await importFileAsNote(vault, '', 'archive.zip', encode('x'));
    expect(zip).toMatchObject({ ok: false });
    if (zip.ok) throw new Error('unreachable');
    expect(zip.reason).toMatch(/unsupported/i);
  });

  it('reports a corrupt file as a per-file failure rather than throwing', async () => {
    const result = await importFileAsNote(vault, '', 'broken.pdf', encode('not a real pdf'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('broken.pdf');
  });
});

describe('importFileAsNote — spreadsheets', () => {
  let root: string;
  let vault: Vault;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-sheet-'));
    await initVault(root);
    vault = openVault(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('imports a CSV as a Markdown table (quoted fields, commas honoured)', async () => {
    const csv = 'Name,Role\n"Kohler, Robert",Eng\nAda,"Research, ML"\n';
    const result = await importFileAsNote(vault, '', 'people.csv', new TextEncoder().encode(csv));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('unreachable');
    const md = await exportNoteToMarkdown(vault, result.path);
    expect(md).toContain('Kohler, Robert'); // comma inside a quoted field preserved
    expect(md).toContain('Research, ML');
    expect(md).toContain('Name');
  });

  it('imports an XLSX workbook as a note with a table', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Col A', 'Col B'],
        ['1', '2'],
      ]),
      'Data',
    );
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = await importFileAsNote(vault, '', 'book.xlsx', new Uint8Array(buf));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('unreachable');
    const md = await exportNoteToMarkdown(vault, result.path);
    expect(md).toContain('Col A'); // header cell
    expect(md).toContain('2'); // data cell
  });
});
