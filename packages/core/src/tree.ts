/**
 * Folder/note tree listing. Walks the vault directory, surfacing folders and note files while
 * ignoring the reserved {@link BRAIN_DIR} and any non-note files (e.g. RULES.md). Paths are
 * vault-relative and POSIX-separated so they are stable across platforms and usable as keys.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BRAIN_DIR, NOTE_EXTENSION } from './paths.js';

export type TreeNodeType = 'folder' | 'note';

export interface TreeNode {
  /** Folder name, or a note's filename without the {@link NOTE_EXTENSION}. */
  name: string;
  /** Vault-relative POSIX path: the directory for a folder, the file for a note. */
  path: string;
  type: TreeNodeType;
  /** Present on folders only; sorted folders-first then notes, each alphabetical. */
  children?: TreeNode[];
}

function noteName(fileName: string): string {
  return fileName.slice(0, -NOTE_EXTENSION.length);
}

function byName(a: TreeNode, b: TreeNode): number {
  return a.name.localeCompare(b.name);
}

async function listDir(absDir: string, relDir: string): Promise<TreeNode[]> {
  const entries = await readdir(absDir, { withFileTypes: true });
  const folders: TreeNode[] = [];
  const notes: TreeNode[] = [];

  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (relDir === '' && entry.name === BRAIN_DIR) continue; // reserved internals
      folders.push({
        name: entry.name,
        path: relPath,
        type: 'folder',
        children: await listDir(join(absDir, entry.name), relPath),
      });
    } else if (entry.isFile() && entry.name.endsWith(NOTE_EXTENSION)) {
      notes.push({ name: noteName(entry.name), path: relPath, type: 'note' });
    }
  }

  folders.sort(byName);
  notes.sort(byName);
  return [...folders, ...notes];
}

/** Return the vault's folder/note hierarchy as a sorted, deterministic tree. */
export async function listTree(vaultRoot: string): Promise<TreeNode[]> {
  return listDir(vaultRoot, '');
}
