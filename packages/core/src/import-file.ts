/**
 * File import (drag-in): convert a foreign document into a native note (ADR 0001 — every surface
 * accepts more than block JSON). Converters are a **table by extension** — Markdown/plain text
 * natively, `.docx` via mammoth (→ Markdown → blocks), `.pdf` via text extraction — so adding a
 * format is one entry. Heavy converters are lazy-imported: they only load when that format is
 * actually dropped. The note is created under a unique name derived from the filename; import
 * never overwrites.
 */
import { NoteExistsError } from './errors.js';
import { markdownToBlocks } from './markdown.js';
import { NOTE_EXTENSION } from './paths.js';
import { readSheets } from './spreadsheet.js';
import { createNote, titleToFilenameBase, type Vault } from './vault.js';

/** One import outcome: where the note landed (or why the file couldn't be converted). */
export type ImportResult =
  | { ok: true; path: string; title: string }
  | { ok: false; file: string; reason: string };

/** Converts one file format into Markdown (the common intermediate before blocks). */
interface FileConverter {
  extensions: string[];
  toMarkdown(data: Uint8Array, fileName: string): Promise<string>;
}

const decoder = new TextDecoder();

/** Cap rows written into a note table so a giant sheet doesn't produce an unusable note. */
const MAX_TABLE_ROWS = 1000;

/** Render rows as a GitHub-flavoured Markdown table (first row = header); BlockNote parses it to a table. */
function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const esc = (s: string) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
  const cells = (r: string[]) => Array.from({ length: width }, (_, i) => esc(r[i] ?? ''));
  const line = (r: string[]) => `| ${cells(r).join(' | ')} |`;
  const header = rows[0] ?? [];
  const sep = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  const body = rows.slice(1, MAX_TABLE_ROWS + 1).map(line);
  const dropped = rows.length - 1 - MAX_TABLE_ROWS;
  const note = dropped > 0 ? `\n\n_(${dropped} more rows not shown)_` : '';
  return `${[line(header), sep, ...body].join('\n')}${note}`;
}

const CONVERTERS: FileConverter[] = [
  {
    extensions: ['.md', '.markdown', '.txt', '.text'],
    toMarkdown: async (data) => decoder.decode(data),
  },
  {
    extensions: ['.docx'],
    toMarkdown: async (data) => {
      // mammoth's convertToMarkdown exists at runtime but is missing from its type declarations.
      const mammoth = (await import('mammoth')) as unknown as {
        convertToMarkdown(input: { buffer: Buffer }): Promise<{ value: string }>;
      };
      const result = await mammoth.convertToMarkdown({ buffer: Buffer.from(data) });
      return result.value;
    },
  },
  {
    extensions: ['.pdf'],
    toMarkdown: async (data) => {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(data) });
      try {
        const result = await parser.getText();
        return result.text ?? '';
      } finally {
        await parser.destroy?.();
      }
    },
  },
  {
    // CSV/TSV/XLSX → a note with a Markdown table per sheet. Shares readSheets with the database
    // importer (one parser, and the XLSX !ref-clamp perf fix applies here too).
    extensions: ['.csv', '.tsv', '.xlsx', '.xls'],
    toMarkdown: async (data, fileName) => {
      const sheets = await readSheets(fileName, data);
      return sheets
        .map((s) => {
          const table = rowsToMarkdownTable(s.rows);
          if (!table) return '';
          return sheets.length > 1 ? `## ${s.name}\n\n${table}` : table;
        })
        .filter(Boolean)
        .join('\n\n');
    },
  },
];

/** Formats we can import, for UIs to advertise. */
export const IMPORTABLE_EXTENSIONS = CONVERTERS.flatMap((c) => c.extensions);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  return titleToFilenameBase(base) || 'Imported';
}

/**
 * Import one dropped file into `folder` ('' = vault root) as a new note. Returns a result rather
 * than throwing for unsupported/corrupt files, so a multi-file drop reports per-file outcomes.
 */
export async function importFileAsNote(
  vault: Vault,
  folder: string,
  fileName: string,
  data: Uint8Array,
): Promise<ImportResult> {
  const ext = extensionOf(fileName);
  if (ext === '.doc') {
    return {
      ok: false,
      file: fileName,
      reason: 'Legacy .doc is not supported — save it as .docx and drop it again.',
    };
  }
  const converter = CONVERTERS.find((c) => c.extensions.includes(ext));
  if (!converter) {
    return {
      ok: false,
      file: fileName,
      reason: `Unsupported file type "${ext || fileName}" (supported: ${IMPORTABLE_EXTENSIONS.join(', ')}).`,
    };
  }
  let markdown: string;
  try {
    markdown = await converter.toMarkdown(data, fileName);
  } catch (error) {
    return {
      ok: false,
      file: fileName,
      reason: `Could not read ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const blocks = await markdownToBlocks(markdown);
  const title = titleFromFileName(fileName);
  // Unique name derived from the file's own name; never overwrite an existing note.
  for (let n = 0; ; n += 1) {
    const name = `${title}${n === 0 ? '' : ` ${n}`}${NOTE_EXTENSION}`;
    const relPath = folder ? `${folder}/${name}` : name;
    try {
      await createNote(vault, relPath, { title, blocks });
      return { ok: true, path: relPath, title };
    } catch (error) {
      if (error instanceof NoteExistsError) continue;
      return {
        ok: false,
        file: fileName,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
