/**
 * Pure decision logic for the folder tree — path remapping across folder renames/moves, tree
 * lookups, and the drag-and-drop rules (what a drop means, whether it's allowed, and the resulting
 * manual order). Extracted from the FolderTree component so it is unit-testable without a DOM;
 * the component owns only state and rendering.
 */
import type { TreeNode } from '@brain/core';
import { entryName } from '@brain/core/paths';

/** Where a drop would land: inside a folder (or the root, path ''), or adjacent to a sibling row. */
export interface DropHint {
  path: string;
  pos: 'before' | 'after' | 'into';
}

/** Find a node anywhere in the tree by its vault-relative path. */
export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const inChild = node.children ? findNode(node.children, path) : null;
    if (inChild) return inChild;
  }
  return null;
}

/**
 * The first note in display order (depth-first, as rendered) — what to open on launch so the
 * editor starts with content, not the empty state. Null when the vault has no notes at all.
 */
export function firstNotePath(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'note') return node.path;
    const inChild = node.children ? firstNotePath(node.children) : null;
    if (inChild) return inChild;
  }
  return null;
}

/** Every folder path in the tree (for the Move-to dialog). */
export function collectFolders(nodes: TreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'folder') {
      acc.push(node.path);
      if (node.children) collectFolders(node.children, acc);
    }
  }
  return acc;
}

/** Rewrite paths at or under `oldPath` to `newPath` (or drop them if `newPath` is null). */
export function remapPath(value: string, oldPath: string, newPath: string | null): string | null {
  if (value === oldPath) return newPath;
  if (value.startsWith(`${oldPath}/`)) {
    return newPath === null ? null : newPath + value.slice(oldPath.length);
  }
  return value;
}

/**
 * The tree flattened to its currently *visible* rows, top-to-bottom — the traversal order for
 * keyboard navigation (children of collapsed folders are skipped).
 */
export function flattenVisible(nodes: TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.type === 'folder' && expanded.has(node.path) && node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/** The parent folder of a vault-relative path ('' at the root). */
export function currentParent(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

/** Whether `dragged` may be moved into `target` (null = the vault root). */
export function canDropInto(dragged: TreeNode | null, target: TreeNode | null): boolean {
  if (!dragged) return false;
  const targetPath = target ? target.path : '';
  if (targetPath === dragged.path) return false; // onto itself
  if (targetPath === currentParent(dragged.path)) return false; // already there
  // A folder can't move into itself or a descendant.
  if (dragged.type === 'folder' && targetPath.startsWith(`${dragged.path}/`)) return false;
  return true;
}

/**
 * What a drag over `target` at vertical position `frac` (0=top, 1=bottom) means: move `into` a
 * folder, or reorder `before`/`after` the row. Edges of a folder reorder; its middle moves in.
 * Reorder is offered only between current siblings, so a reorder never also has to move a file.
 */
export function dropIntentFor(
  dragged: TreeNode | null,
  target: TreeNode,
  frac: number,
): DropHint | null {
  if (!dragged || dragged.path === target.path) return null;
  const sameParent = currentParent(dragged.path) === currentParent(target.path);
  if (canDropInto(dragged, target) && target.type === 'folder') {
    if (sameParent && frac < 0.25) return { path: target.path, pos: 'before' };
    if (sameParent && frac > 0.75) return { path: target.path, pos: 'after' };
    return { path: target.path, pos: 'into' };
  }
  if (sameParent) return { path: target.path, pos: frac < 0.5 ? 'before' : 'after' };
  return null;
}

/**
 * The sibling order (on-disk entry names) after placing `dragged` just before/after `target`, or
 * null if `target` isn't among `children`. This is what gets persisted to the folder's order file.
 */
export function reorderedNames(
  children: TreeNode[],
  dragged: TreeNode,
  target: TreeNode,
  pos: 'before' | 'after',
): string[] | null {
  const names = children.map(entryName).filter((n) => n !== entryName(dragged));
  let at = names.indexOf(entryName(target));
  if (at < 0) return null;
  if (pos === 'after') at += 1;
  names.splice(at, 0, entryName(dragged));
  return names;
}
