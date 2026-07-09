import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { listTree } from './tree.js';

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
