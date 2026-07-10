/**
 * Spreadsheet import (CSV/TSV/XLSX) — the smart path that can turn tabular data into a native
 * **database** (folder + `database.json` + a note per row) instead of a static table, or into a
 * plain note when the data isn't really tabular. Column types are inferred from the data, multiple
 * worksheets become a folder of tables, and a `analyze` step recommends database-vs-note so the UI
 * can ask the owner. Row creation reports progress and yields, so a big file never freezes the app.
 *
 * Performance note: XLSX files exported by tools often carry an inflated `!ref` (e.g. a million
 * declared rows for 3k of data); SheetJS then walks the whole declared range. We clamp `!ref` to
 * the actually-populated range first — on a real 3,305-row sheet that's 5.8s → 8ms.
 */
import type { PropertyDef, PropertyType } from './database.js';
import { writeDatabase } from './database.js';
import { createNote, titleToFilenameBase, type Vault } from './vault.js';

/** One worksheet: a name and a grid of string cells (row 0 may or may not be a header). */
export interface Sheet {
  name: string;
  rows: string[][];
}

/** Per-sheet analysis used for the import recommendation and schema. */
export interface SheetPlan {
  name: string;
  columns: PropertyDef[];
  /** Row index that looks like the header (values above it are titles/notes and skipped). */
  headerRow: number;
  dataRows: number;
}

export interface ImportAnalysis {
  kind: 'spreadsheet';
  sheets: SheetPlan[];
  totalDataRows: number;
  /** What we'd suggest by default; the owner can override. */
  recommendation: 'database' | 'note';
  reason: string;
}

/** Largest number of rows imported into a database per sheet — keeps a huge dump from exploding. */
export const MAX_DATABASE_ROWS = 2000;
/** Above this row count a database (one note per row) gets slow/cluttered, so we recommend a note. */
const DATABASE_SWEET_SPOT = 500;

const decoder = new TextDecoder();
const SPREADSHEET_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls'];

/** Whether a filename looks like a spreadsheet we can read into sheets. */
export function isSpreadsheet(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return SPREADSHEET_EXTENSIONS.includes(ext);
}

/** Parse CSV/TSV into rows, honouring quoted fields, escaped `""`, and newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Read a CSV/TSV/XLSX file into worksheets. XLSX is read with the `!ref`-clamp performance fix. */
export async function readSheets(fileName: string, data: Uint8Array): Promise<Sheet[]> {
  const lower = fileName.toLowerCase();
  const base = fileName.slice(0, fileName.lastIndexOf('.')) || fileName;
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    return [
      {
        name: base,
        rows: parseDelimited(decoder.decode(data), lower.endsWith('.tsv') ? '\t' : ','),
      },
    ];
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    if (!sheet) return { name, rows: [] };
    clampRef(XLSX, sheet); // the 5.8s → 8ms fix
    const raw = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    }) as unknown[][];
    const rows = raw
      .map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : []))
      .filter((r) => r.some((cell) => cell.trim() !== ''));
    return { name, rows };
  });
}

/** Shrink a sheet's declared range to the cells that actually hold data. */
function clampRef(XLSX: typeof import('xlsx'), sheet: import('xlsx').WorkSheet): void {
  let maxR = 0;
  let maxC = 0;
  for (const key of Object.keys(sheet)) {
    if (key[0] === '!') continue;
    const cell = XLSX.utils.decode_cell(key);
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c > maxC) maxC = cell.c;
  }
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

/** Detect the header row: the first of the first few rows with the most non-empty cells (≥2). */
function detectHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestFilled = 0;
  for (let i = 0; i < Math.min(rows.length, 8); i += 1) {
    const filled = (rows[i] ?? []).filter((c) => c.trim() !== '').length;
    if (filled > bestFilled) {
      bestFilled = filled;
      best = i;
    }
  }
  return bestFilled >= 2 ? best : 0;
}

const NUMBER_RE = /^-?[\d,]*\.?\d+%?$/;
const BOOL_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n']);

/** Infer a column's property type from a sample of its values. */
function inferType(values: string[]): { type: PropertyType; options?: string[] } {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return { type: 'text' };
  const all = (pred: (v: string) => boolean) => nonEmpty.every(pred);
  if (all((v) => BOOL_VALUES.has(v.toLowerCase()))) return { type: 'checkbox' };
  if (all((v) => NUMBER_RE.test(v.replace(/\s/g, '')))) return { type: 'number' };
  if (all((v) => !Number.isNaN(Date.parse(v)) && /\d/.test(v) && /[-/:]/.test(v)))
    return { type: 'date' };
  if (all((v) => /^https?:\/\//i.test(v))) return { type: 'url' };
  // Categorical: a small set of distinct values that repeat (not free text).
  const distinct = [...new Set(nonEmpty)];
  if (distinct.length <= 12 && distinct.length < nonEmpty.length) {
    return { type: 'select', options: distinct.sort() };
  }
  return { type: 'text' };
}

let idSeq = 0;
/** A stable, unique property id for an imported column (deterministic within one import). */
function columnId(index: number): string {
  idSeq += 1;
  return `c_${index}_${idSeq.toString(36)}`;
}

/** Build a column schema for a sheet by reading its header row + sampling the data below it. */
function planSheet(sheet: Sheet): SheetPlan {
  const headerRow = detectHeaderRow(sheet.rows);
  const header = sheet.rows[headerRow] ?? [];
  const dataRows = sheet.rows.slice(headerRow + 1);
  const width = Math.max(header.length, ...dataRows.map((r) => r.length), 0);
  const sample = dataRows.slice(0, 50);
  const columns: PropertyDef[] = [];
  for (let c = 0; c < width; c += 1) {
    const name = (header[c] ?? '').trim() || `Column ${c + 1}`;
    const { type, options } = inferType(sample.map((r) => r[c] ?? ''));
    columns.push({ id: columnId(c), name, type, ...(options ? { options } : {}) });
  }
  return { name: sheet.name, columns, headerRow, dataRows: dataRows.length };
}

/** Analyse a spreadsheet file and recommend how to import it. */
export async function analyzeSpreadsheet(
  fileName: string,
  data: Uint8Array,
): Promise<ImportAnalysis> {
  const sheets = (await readSheets(fileName, data)).filter((s) => s.rows.length > 0);
  const plans = sheets.map(planSheet);
  const totalDataRows = plans.reduce((n, p) => n + p.dataRows, 0);
  // Tabular = at least one sheet with ≥2 columns and ≥1 data row. A database is the nicer home for a
  // modest table (sort/filter/board); a large dump is faster and tidier as a single note table.
  const tabular = plans.some((p) => p.columns.length >= 2 && p.dataRows >= 1);
  const modest = totalDataRows <= DATABASE_SWEET_SPOT;
  const shape = `${plans.length > 1 ? `${plans.length} sheets, ` : ''}${totalDataRows.toLocaleString()} rows × ${plans[0]?.columns.length ?? 0} columns`;
  return {
    kind: 'spreadsheet',
    sheets: plans,
    totalDataRows,
    recommendation: tabular && modest ? 'database' : 'note',
    reason: !tabular
      ? "This doesn't look like a table — importing as a note."
      : modest
        ? `${shape} — a database lets you sort, filter, and board it.`
        : `${shape} — large, so a note table imports fast; you can still choose Database.`,
  };
}

/** Coerce a cell string to a typed database value; undefined = leave the cell empty. */
function coerce(value: string, type: PropertyType): unknown {
  const v = value.trim();
  if (!v) return undefined;
  if (type === 'number') {
    const n = Number(v.replace(/,/g, '').replace('%', ''));
    return Number.isNaN(n) ? undefined : n;
  }
  if (type === 'checkbox') return ['true', 'yes', 'y'].includes(v.toLowerCase());
  return v; // text/select/date/url stay as strings
}

export interface ImportProgress {
  done: number;
  total: number;
  label: string;
}

export interface SpreadsheetImportResult {
  /** The folder (database) or note path created; the first thing to open. */
  path: string;
  rowsImported: number;
  rowsDropped: number;
  sheets: number;
}

/**
 * Import a spreadsheet as one or more **databases**: a single sheet becomes `folder/<name>` (a
 * database folder with a row-note per data row); multiple sheets become `folder/<name>/` with one
 * database subfolder per sheet. Rows past {@link MAX_DATABASE_ROWS} per sheet are skipped (counted).
 * `onProgress` fires as rows are written; each write yields, so the caller's process stays responsive.
 */
export async function importSpreadsheetAsDatabase(
  vault: Vault,
  folder: string,
  fileName: string,
  data: Uint8Array,
  onProgress?: (p: ImportProgress) => void,
): Promise<SpreadsheetImportResult> {
  const sheets = (await readSheets(fileName, data)).filter((s) => s.rows.length > 0);
  const plans = sheets.map((s) => ({ sheet: s, plan: planSheet(s) }));
  const base =
    titleToFilenameBase(fileName.slice(0, fileName.lastIndexOf('.')) || fileName) || 'Imported';
  const multi = plans.length > 1;
  const rootFolder = folder ? `${folder}/${base}` : base;

  const total = plans.reduce((n, { plan }) => n + Math.min(plan.dataRows, MAX_DATABASE_ROWS), 0);
  let done = 0;
  let dropped = 0;

  for (const { sheet, plan } of plans) {
    const dbFolder = multi
      ? `${rootFolder}/${titleToFilenameBase(sheet.name) || 'Sheet'}`
      : rootFolder;
    const hasSelect = plan.columns.find((c) => c.type === 'select');
    await writeDatabase(vault, dbFolder, {
      version: 1,
      properties: plan.columns,
      views: [
        { name: 'Table', type: 'table' },
        ...(hasSelect ? [{ name: 'Board', type: 'board' as const, groupBy: hasSelect.id }] : []),
      ],
    });

    const dataRows = sheet.rows.slice(plan.headerRow + 1);
    dropped += Math.max(0, dataRows.length - MAX_DATABASE_ROWS);
    const titleCol = 0;
    const used = new Set<string>();
    for (const row of dataRows.slice(0, MAX_DATABASE_ROWS)) {
      const properties: Record<string, unknown> = {};
      for (let c = 0; c < plan.columns.length; c += 1) {
        const col = plan.columns[c];
        if (!col) continue;
        const val = coerce(row[c] ?? '', col.type);
        if (val !== undefined) properties[col.id] = val;
      }
      const rawTitle = (row[titleCol] ?? '').trim() || `Row ${done + 1}`;
      const stem = titleToFilenameBase(rawTitle).slice(0, 80) || `Row ${done + 1}`;
      // Keep row filenames unique within the sheet without a read-back per row.
      let name = stem;
      let suffix = 1;
      while (used.has(name.toLowerCase())) {
        suffix += 1;
        name = `${stem} ${suffix}`;
      }
      used.add(name.toLowerCase());
      await createNote(vault, `${dbFolder}/${name}.note.json`, {
        title: rawTitle,
        properties,
        blocks: [],
      });
      done += 1;
      if (onProgress && (done % 25 === 0 || done === total)) {
        onProgress({
          done,
          total,
          label: multi ? `${sheet.name}: row ${done}` : `row ${done} of ${total}`,
        });
      }
    }
  }

  return { path: rootFolder, rowsImported: done, rowsDropped: dropped, sheets: plans.length };
}
