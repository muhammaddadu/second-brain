import type { TreeNode } from '@brain/core';
import { describe, expect, it } from 'vitest';
import {
  canDropInto,
  collectFolders,
  currentParent,
  dropIntentFor,
  findNode,
  remapPath,
  reorderedNames,
} from './folder-tree-logic';

const note = (path: string): TreeNode => ({
  name: path.split('/').pop()?.replace('.note.json', '') ?? path,
  path,
  type: 'note',
});
const folder = (path: string, children: TreeNode[] = []): TreeNode => ({
  name: path.split('/').pop() ?? path,
  path,
  type: 'folder',
  children,
});

const tree: TreeNode[] = [
  folder('Journal', [note('Journal/a.note.json'), note('Journal/b.note.json')]),
  folder('Projects', [folder('Projects/alpha', [note('Projects/alpha/idx.note.json')])]),
  note('root.note.json'),
];

describe('tree lookups', () => {
  it('findNode finds nested nodes and misses gracefully', () => {
    expect(findNode(tree, 'Projects/alpha')?.type).toBe('folder');
    expect(findNode(tree, 'Journal/b.note.json')?.type).toBe('note');
    expect(findNode(tree, 'nope')).toBeNull();
  });

  it('collectFolders lists every folder path', () => {
    expect(collectFolders(tree)).toEqual(['Journal', 'Projects', 'Projects/alpha']);
  });

  it('remapPath rewrites the path itself and descendants, dropping on null', () => {
    expect(remapPath('A/b', 'A', 'Z')).toBe('Z/b');
    expect(remapPath('A', 'A', 'Z')).toBe('Z');
    expect(remapPath('A/b', 'A', null)).toBeNull();
    expect(remapPath('Other/x', 'A', 'Z')).toBe('Other/x');
  });

  it('currentParent handles root and nested paths', () => {
    expect(currentParent('root.note.json')).toBe('');
    expect(currentParent('Journal/a.note.json')).toBe('Journal');
  });
});

describe('drag-and-drop rules', () => {
  const journal = findNode(tree, 'Journal') as TreeNode;
  const alpha = findNode(tree, 'Projects/alpha') as TreeNode;
  const a = findNode(tree, 'Journal/a.note.json') as TreeNode;
  const b = findNode(tree, 'Journal/b.note.json') as TreeNode;

  it('canDropInto rejects self, current parent, and folder-into-descendant', () => {
    expect(canDropInto(null, journal)).toBe(false);
    expect(canDropInto(journal, journal)).toBe(false); // onto itself
    expect(canDropInto(a, journal)).toBe(false); // already there
    expect(canDropInto(findNode(tree, 'Projects') as TreeNode, alpha)).toBe(false); // descendant
    expect(canDropInto(a, alpha)).toBe(true);
    expect(canDropInto(a, null)).toBe(true); // to root
  });

  it('dropIntentFor: folder middle = into, sibling edges = reorder', () => {
    // A note over a non-sibling folder is "into" regardless of position.
    expect(dropIntentFor(a, alpha, 0.1)?.pos).toBe('into');
    // Siblings reorder on edges.
    expect(dropIntentFor(a, b, 0.1)).toEqual({ path: b.path, pos: 'before' });
    expect(dropIntentFor(a, b, 0.9)).toEqual({ path: b.path, pos: 'after' });
    // No intent onto itself or for a non-sibling non-folder.
    expect(dropIntentFor(a, a, 0.5)).toBeNull();
    expect(dropIntentFor(a, findNode(tree, 'root.note.json') as TreeNode, 0.5)).toBeNull();
  });

  it('reorderedNames splices the dragged entry around the target', () => {
    const children = [a, b];
    expect(reorderedNames(children, b, a, 'before')).toEqual(['b.note.json', 'a.note.json']);
    expect(reorderedNames(children, a, b, 'after')).toEqual(['b.note.json', 'a.note.json']);
    expect(reorderedNames(children, a, note('X/none.note.json'), 'before')).toBeNull();
  });
});
