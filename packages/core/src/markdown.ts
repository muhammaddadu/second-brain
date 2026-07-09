/**
 * Markdown ↔ BlockNote-blocks conversion, headless. The vault's resting format is native block
 * JSON (ADR 0001); Markdown is only an interchange format at the boundary. Core owns this
 * conversion so every surface behaves identically — done here with BlockNote's own headless
 * `ServerBlockNoteEditor` (no DOM/React) so the CLI and MCP server can convert with the app
 * closed. Conversion is intentionally lossy by BlockNote's definition; that loss is confined to
 * this boundary and never touches the stored file. See ADR 0003.
 */
import { ServerBlockNoteEditor } from '@blocknote/server-util';

// One editor instance is enough and avoids re-creating the (heavy) engine per call.
let sharedEditor: ReturnType<typeof ServerBlockNoteEditor.create> | undefined;

function editor(): ReturnType<typeof ServerBlockNoteEditor.create> {
  if (!sharedEditor) sharedEditor = ServerBlockNoteEditor.create();
  return sharedEditor;
}

/**
 * Parse a Markdown string into BlockNote blocks. Unrecognised syntax degrades to plain text
 * rather than throwing (BlockNote's parser behaviour), so import never fails on odd input.
 */
export async function markdownToBlocks(markdown: string): Promise<unknown[]> {
  return editor().tryParseMarkdownToBlocks(markdown);
}

/** Render BlockNote blocks to Markdown (lossy view — the JSON file remains the source of truth). */
export async function blocksToMarkdown(blocks: unknown[]): Promise<string> {
  const ed = editor();
  return ed.blocksToMarkdownLossy(blocks as Parameters<typeof ed.blocksToMarkdownLossy>[0]);
}
