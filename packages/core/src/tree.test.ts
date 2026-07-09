import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORDER_FILE } from './paths.js';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { listTree } from './tree.js';
import { createFolder, createNote, openVault, setFolderOrder } from './vault.js';

describe('listTree', () => {
  let fixture: FixtureVault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('returns the folder/note hierarchy', async () => {
    const tree = await listTree(fixture.root);
    const names = tree.map((n) => n.name);
    expect(names).toEqual(['Journal', 'Projects']); // folders, alphabetical

    const journal = tree.find((n) => n.name === 'Journal');
    expect(journal?.type).toBe('folder');
    expect(journal?.children?.map((c) => c.name)).toEqual(['2026-07-07']); // extension stripped
    expect(journal?.children?.[0]?.path).toBe('Journal/2026-07-07.note.json'); // real file path

    const projects = tree.find((n) => n.name === 'Projects');
    const alpha = projects?.children?.find((c) => c.name === 'alpha');
    expect(alpha?.children?.[0]?.path).toBe('Projects/alpha/index.note.json');
  });

  it('ignores the reserved .brain directory and non-note files (RULES.md)', async () => {
    const tree = await listTree(fixture.root);
    const names = tree.map((n) => n.name);
    expect(names).not.toContain('.brain');
    expect(names).not.toContain('RULES.md');
    expect(names).not.toContain('RULES');
  });
});

describe('manual folder ordering (ADR 0005)', () => {
  let fixture: FixtureVault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  async function seedNotes() {
    const vault = openVault(fixture.root);
    await createNote(vault, 'Notes/a.note.json', { title: 'a' });
    await createNote(vault, 'Notes/b.note.json', { title: 'b' });
    await createNote(vault, 'Notes/c.note.json', { title: 'c' });
    await createFolder(vault, 'Notes/Sub');
    return vault;
  }

  async function childNames(folder: string) {
    const tree = await listTree(fixture.root);
    const node = tree.find((n) => n.name === folder);
    return node?.children?.map((c) => c.name);
  }

  it('defaults to folders-first, alphabetical when there is no order sidecar', async () => {
    await seedNotes();
    expect(await childNames('Notes')).toEqual(['Sub', 'a', 'b', 'c']);
  });

  it('follows the order sidecar and can interleave folders with notes', async () => {
    const vault = await seedNotes();
    await setFolderOrder(vault, 'Notes', ['c.note.json', 'Sub', 'a.note.json']);
    // Listed items in the file's order first; the unlisted note ('b') falls back to the end.
    expect(await childNames('Notes')).toEqual(['c', 'Sub', 'a', 'b']);
  });

  it('is unaffected by a malformed or non-array sidecar (falls back to default sort)', async () => {
    await seedNotes();
    await writeFile(join(fixture.root, 'Notes', ORDER_FILE), 'not json', 'utf8');
    expect(await childNames('Notes')).toEqual(['Sub', 'a', 'b', 'c']);
  });

  it('setFolderOrder writes a readable sidecar and rejects names with path separators', async () => {
    const vault = await seedNotes();
    await setFolderOrder(vault, 'Notes', ['b.note.json', 'a.note.json']);
    const raw = await readFile(join(fixture.root, 'Notes', ORDER_FILE), 'utf8');
    expect(JSON.parse(raw)).toEqual(['b.note.json', 'a.note.json']);

    await expect(setFolderOrder(vault, 'Notes', ['../evil'])).rejects.toThrow();
    await expect(setFolderOrder(vault, 'Notes', ['sub/x.note.json'])).rejects.toThrow();
  });

  it('orders the vault root when folderRel is empty', async () => {
    const vault = openVault(fixture.root);
    await setFolderOrder(vault, '', ['Projects', 'Journal']);
    const tree = await listTree(fixture.root);
    expect(tree.map((n) => n.name)).toEqual(['Projects', 'Journal']); // reverse of default alpha
  });
});
