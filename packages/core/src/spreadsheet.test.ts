import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDatabase } from './database.js';
import { analyzeSpreadsheet, importSpreadsheetAsDatabase, parseDelimited } from './spreadsheet.js';
import { initVault, openVault, readNote, type Vault } from './vault.js';

const enc = (s: string) => new TextEncoder().encode(s);

describe('parseDelimited', () => {
  it('honours quoted fields, commas, and escaped quotes', () => {
    const rows = parseDelimited('a,b\n"x,y","he said ""hi"""\n', ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
    ]);
  });
});

describe('analyzeSpreadsheet', () => {
  it('recommends a database for a modest table', async () => {
    const csv = 'Name,Status,Priority\nAlpha,Todo,1\nBeta,Done,2\nGamma,Todo,3\n';
    const a = await analyzeSpreadsheet('tasks.csv', enc(csv));
    expect(a.recommendation).toBe('database');
    expect(a.sheets[0]?.columns.map((c) => c.name)).toEqual(['Name', 'Status', 'Priority']);
    // types inferred: Status low-cardinality → select; Priority numeric → number
    expect(a.sheets[0]?.columns[1]?.type).toBe('select');
    expect(a.sheets[0]?.columns[2]?.type).toBe('number');
  });

  it('recommends a note for a large dump', async () => {
    const rows = ['Name,Value', ...Array.from({ length: 800 }, (_, i) => `Row ${i},${i}`)];
    const a = await analyzeSpreadsheet('big.csv', enc(rows.join('\n')));
    expect(a.recommendation).toBe('note');
    expect(a.totalDataRows).toBe(800);
  });
});

describe('importSpreadsheetAsDatabase', () => {
  let root: string;
  let vault: Vault;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-ss-'));
    await initVault(root);
    vault = openVault(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates a database folder with a schema and one note per row', async () => {
    const csv = 'Name,Status,Priority\nAlpha,Todo,1\nBeta,Done,2\n';
    const result = await importSpreadsheetAsDatabase(vault, 'Imports', 'tasks.csv', enc(csv));
    expect(result).toMatchObject({
      path: 'Imports/tasks',
      rowsImported: 2,
      rowsDropped: 0,
      sheets: 1,
    });

    const schema = await readDatabase(vault, 'Imports/tasks');
    expect(schema?.properties.map((p) => p.name)).toEqual(['Name', 'Status', 'Priority']);

    // A row note carries typed properties keyed by the schema's stable ids.
    const alpha = await readNote(vault, 'Imports/tasks/Alpha.note.json');
    expect(alpha.meta.title).toBe('Alpha');
    const priorityId = schema?.properties[2]?.id as string;
    expect(alpha.meta.properties?.[priorityId]).toBe(1); // number coerced
  });

  it('reports progress and yields', async () => {
    const csv = ['Name,N', ...Array.from({ length: 60 }, (_, i) => `R${i},${i}`)].join('\n');
    const seen: number[] = [];
    await importSpreadsheetAsDatabase(vault, '', 'rows.csv', enc(csv), (p) => seen.push(p.done));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(60);
  });

  it('multiple sheets become a folder with one database per sheet', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['A', 'B'],
        ['1', '2'],
      ]),
      'One',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['C', 'D'],
        ['3', '4'],
      ]),
      'Two',
    );
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = await importSpreadsheetAsDatabase(vault, '', 'book.xlsx', new Uint8Array(buf));
    expect(result.sheets).toBe(2);
    expect((await readDatabase(vault, 'book/One'))?.properties).toHaveLength(2);
    expect((await readDatabase(vault, 'book/Two'))?.properties).toHaveLength(2);
  });
});
