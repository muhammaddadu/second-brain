/**
 * Markdown import/export at the vault level — the interchange boundary (PRD §4.4). Whole-vault
 * export is the longevity guarantee: a vault stays usable with the app uninstalled. All of this
 * composes core primitives (tree, read, create) with the {@link markdownToBlocks}/
 * {@link blocksToMarkdown} conversion seam; no surface converts on its own.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { NoteEnvelope } from './envelope.js';
import { blocksToMarkdown, markdownToBlocks } from './markdown.js';
import { NOTE_EXTENSION } from './paths.js';
import { listTree } from './tree.js';
import { type CreateNoteInput, createNote, readNote, type Vault } from './vault.js';

/** Create a new note from a Markdown string (converted to blocks on write). Refuses to clobber. */
export async function importMarkdownAsNote(
  vault: Vault,
  relPath: string,
  markdown: string,
  meta: Omit<CreateNoteInput, 'blocks'> = {},
): Promise<NoteEnvelope> {
  const blocks = await markdownToBlocks(markdown);
  return createNote(vault, relPath, { ...meta, blocks });
}

/** Export one note to a Markdown string (lossy view; the JSON file stays canonical). */
export async function exportNoteToMarkdown(vault: Vault, relPath: string): Promise<string> {
  const note = await readNote(vault, relPath);
  return blocksToMarkdown(note.blocks);
}

/** Collect every note's vault-relative path by walking the tree. */
function collectNotePaths(nodes: Awaited<ReturnType<typeof listTree>>): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'note') paths.push(node.path);
    else if (node.children) paths.push(...collectNotePaths(node.children));
  }
  return paths;
}

/**
 * Export the whole vault to Markdown files under `destDir`, mirroring the folder structure
 * (`Foo/bar.note.json` → `destDir/Foo/bar.md`). Returns the written relative paths. This is a
 * tested, first-class operation, not a nicety (PRD §4.4, §6).
 */
export async function exportVaultToMarkdown(vault: Vault, destDir: string): Promise<string[]> {
  const notePaths = collectNotePaths(await listTree(vault.root));
  const written: string[] = [];
  for (const notePath of notePaths) {
    const markdown = await exportNoteToMarkdown(vault, notePath);
    const mdRelPath = `${notePath.slice(0, -NOTE_EXTENSION.length)}.md`;
    const abs = join(destDir, mdRelPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, markdown, 'utf8');
    written.push(mdRelPath);
  }
  return written;
}
