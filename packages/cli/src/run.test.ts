import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault, openVault, readNote } from '@brain/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Io, run } from './run.js';

/** Capture CLI output for assertions; empty env so no BRAIN_EMBED (keyword-only search). */
function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { env: {}, out: (l) => out.push(l), err: (l) => err.push(l) }, out, err };
}

describe('brain CLI (in-process)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-cli-'));
    await initVault(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function brain(...argv: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
    const c = capture();
    const code = await run([...argv, '--vault', root], c.io);
    return { code, out: c.out, err: c.err };
  }

  it('errors clearly without a vault', async () => {
    const c = capture();
    const code = await run(['tree'], c.io); // no --vault, empty env
    expect(code).toBe(1);
    expect(c.err.join('\n')).toMatch(/vault/i);
  });

  it('create → search finds it → update → read reflects the update', async () => {
    const created = await brain(
      'create',
      'Notes/Ocean.note.json',
      '--title',
      'Ocean',
      '--tags',
      'nature',
      '--content',
      'The deep blue sea and tides.',
    );
    expect(created.code).toBe(0);

    const search = await brain('search', 'tides');
    expect(search.code).toBe(0);
    expect(search.out.join('\n')).toContain('Notes/Ocean.note.json');

    const updated = await brain(
      'update',
      'Notes/Ocean.note.json',
      '--content',
      'Rewritten: mountains and peaks.',
    );
    expect(updated.code).toBe(0);

    const read = await brain('read', 'Notes/Ocean.note.json');
    expect(read.out.join('\n')).toContain('mountains and peaks');
    // The old text is gone from the file.
    const note = await readNote(openVault(root), 'Notes/Ocean.note.json');
    expect(JSON.stringify(note.blocks)).not.toContain('deep blue sea');
    expect(note.meta.title).toBe('Ocean'); // metadata preserved across a content update
  });

  it('json output is parseable for read and tree', async () => {
    await brain('create', 'a.note.json', '--title', 'A', '--content', 'hello');
    const read = await brain('read', 'a.note.json', '--json');
    const parsed = JSON.parse(read.out.join('\n'));
    expect(parsed.meta.title).toBe('A');
    expect(parsed.version).toBe(1);

    const tree = await brain('tree', '--json');
    const nodes = JSON.parse(tree.out.join('\n'));
    // Tree node names are filenames (without the extension), not titles.
    expect(nodes.some((n: { name: string }) => n.name === 'a')).toBe(true);
  });

  it('tags: add and remove, then trash', async () => {
    await brain('create', 'n.note.json', '--title', 'N', '--tags', 'x,y');
    const added = await brain('tag', 'n.note.json', '--add', 'z', '--remove', 'x', '--json');
    expect(JSON.parse(added.out.join('\n')).tags.sort()).toEqual(['y', 'z']);

    const trashed = await brain('trash', 'n.note.json');
    expect(trashed.code).toBe(0);
    const tree = await brain('tree', '--json');
    expect(JSON.parse(tree.out.join('\n')).some((n: { name: string }) => n.name === 'N')).toBe(
      false,
    );
  });
});
