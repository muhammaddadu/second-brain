import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importMarkdownAsNote } from './import-export.js';
import { collectVaultLinks, getBacklinks } from './links.js';
import { initVault, openVault, type Vault } from './vault.js';

describe('vault links (wikilinks across notes)', () => {
  let root: string;
  let vault: Vault;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-links-'));
    await initVault(root);
    vault = openVault(root);
    await importMarkdownAsNote(vault, 'People/Robert Kohler.note.json', 'A person.', {
      title: 'Robert Kohler',
    });
    await importMarkdownAsNote(
      vault,
      'Journal/2026-07-09.note.json',
      'Met [[People/Robert Kohler]] today. Also saw [[Nobody Here]].',
      { title: 'Monday' },
    );
    await importMarkdownAsNote(vault, 'Ideas/Hiring.note.json', 'Talk to [[Robert Kohler]].', {
      title: 'Hiring',
    });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves links (path + title) and reports unresolved targets', async () => {
    const { links, unresolved } = await collectVaultLinks(vault);
    expect(links).toContainEqual({
      from: 'Journal/2026-07-09.note.json',
      to: 'People/Robert Kohler.note.json',
    });
    expect(links).toContainEqual({
      from: 'Ideas/Hiring.note.json',
      to: 'People/Robert Kohler.note.json',
    });
    expect(unresolved).toContainEqual({
      from: 'Journal/2026-07-09.note.json',
      target: 'Nobody Here',
    });
  });

  it('getBacklinks lists the notes linking to a target, with titles', async () => {
    const back = await getBacklinks(vault, 'People/Robert Kohler.note.json');
    expect(back.map((n) => n.path)).toEqual([
      'Ideas/Hiring.note.json',
      'Journal/2026-07-09.note.json',
    ]);
    expect(back.find((n) => n.path === 'Ideas/Hiring.note.json')?.title).toBe('Hiring');
  });
});
