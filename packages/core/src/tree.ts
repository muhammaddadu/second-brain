/**
 * Folder/note tree listing. Walks the vault directory, surfacing folders and note files while
 * ignoring the reserved {@link BRAIN_DIR} and any non-note files (e.g. RULES.md). Paths are
 * vault-relative and POSIX-separated so they are stable across platforms and usable as keys.
 *
 * Within each folder, children follow the folder's manual order ({@link ORDER_FILE}) when present;
 * anything the order file doesn't mention falls back to the default folders-first, alphabetical
 * sort — so the tree is deterministic whether or not a folder has been hand-sorted (ADR 0005).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BRAIN_DIR, NOTE_EXTENSION, ORDER_FILE } from './paths.js';

export type TreeNodeType = 'folder' | 'note';

export interface TreeNode {
  /** Folder name, or a note's filename without the {@link NOTE_EXTENSION}. */
  name: string;
  /** Vault-relative POSIX path: the directory for a folder, the file for a note. */
  path: string;
  type: TreeNodeType;
  /** Present on folders only; ordered per {@link ORDER_FILE}, else folders-first then alphabetical. */
  children?: TreeNode[];
}

function noteName(fileName: string): string {
  return fileName.slice(0, -NOTE_EXTENSION.length);
}

function byName(a: TreeNode, b: TreeNode): number {
  return a.name.localeCompare(b.name);
}

/** The on-disk entry name used as an order key: the dir name for a folder, the filename for a note. */
export function entryName(node: TreeNode): string {
  return node.type === 'folder' ? node.name : `${node.name}${NOTE_EXTENSION}`;
}

/** Read a folder's manual order, or null if it has none / the sidecar is unreadable or malformed. */
async function readOrder(absDir: string): Promise<string[] | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(absDir, ORDER_FILE), 'utf8'));
    if (Array.isArray(parsed) && parsed.every((n): n is string => typeof n === 'string')) {
      return parsed;
    }
  } catch {
    // Missing or malformed → no manual order; fall back to the default sort.
  }
  return null;
}

/**
 * Apply a folder's manual order: listed children first (in the file's order), then everything the
 * file omits in the default order. `children` must already be in default (folders-first/alpha) order
 * so unlisted items keep that fallback.
 */
function applyOrder(children: TreeNode[], order: string[] | null): TreeNode[] {
  if (!order || order.length === 0) return children;
  const rank = new Map(order.map((name, i) => [name, i]));
  const listed: TreeNode[] = [];
  const unlisted: TreeNode[] = [];
  for (const child of children) {
    (rank.has(entryName(child)) ? listed : unlisted).push(child);
  }
  listed.sort((a, b) => (rank.get(entryName(a)) ?? 0) - (rank.get(entryName(b)) ?? 0));
  return [...listed, ...unlisted];
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
  return applyOrder([...folders, ...notes], await readOrder(absDir));
}

/** Return the vault's folder/note hierarchy as a sorted, deterministic tree. */
export async function listTree(vaultRoot: string): Promise<TreeNode[]> {
  return listDir(vaultRoot, '');
}
