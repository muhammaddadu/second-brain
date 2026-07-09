/**
 * E0 E2E: the full life of a note against a real temp-dir vault — create → read → edit body and
 * tags → move → delete-to-trash — asserting on the actual files on disk at each step.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTags, parseNote, setTags } from './envelope.js';
import { BRAIN_DIR, TRASH_DIRNAME } from './paths.js';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { createNote, moveNote, openVault, readNote, trashNote, writeNote } from './vault.js';

async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

describe('note lifecycle (E2E)', () => {
  let fixture: FixtureVault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('drives create → read → edit → move → trash on real files', async () => {
    // A monotonic clock so `updated` provably advances across edits.
    let tick = 0;
    const vault = openVault(fixture.root, {
      now: () => `2026-07-09T12:00:0${tick++}.000Z`,
    });

    // 1. Create
    await createNote(vault, 'Inbox/idea.note.json', { title: 'Idea', tags: ['draft'] });
    const createdPath = join(fixture.root, 'Inbox/idea.note.json');
    expect(await exists(createdPath)).toBe(true);

    // 2. Read
    const note = await readNote(vault, 'Inbox/idea.note.json');
    expect(note.meta.title).toBe('Idea');
    expect(getTags(note)).toEqual(['draft']);
    const createdAt = note.meta.created;

    // 3. Edit body + tags, persist
    const edited = setTags(
      {
        ...note,
        blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body', styles: {} }] }],
      },
      ['draft', 'reviewed'],
    );
    await writeNote(vault, 'Inbox/idea.note.json', edited);
    const afterEdit = parseNote(await readFile(createdPath, 'utf8'));
    expect(getTags(afterEdit)).toEqual(['draft', 'reviewed']);
    expect(afterEdit.blocks).toHaveLength(1);
    expect(afterEdit.meta.created).toBe(createdAt); // created is stable
    expect(afterEdit.meta.updated).not.toBe(createdAt); // updated advanced

    // 4. Move
    await moveNote(vault, 'Inbox/idea.note.json', 'Projects/idea.note.json');
    expect(await exists(createdPath)).toBe(false);
    const movedPath = join(fixture.root, 'Projects/idea.note.json');
    expect(await exists(movedPath)).toBe(true);
    expect(getTags(parseNote(await readFile(movedPath, 'utf8')))).toEqual(['draft', 'reviewed']);

    // 5. Delete to trash (recoverable, not gone)
    const trashRel = await trashNote(vault, 'Projects/idea.note.json');
    expect(await exists(movedPath)).toBe(false);
    expect(trashRel.startsWith(`${BRAIN_DIR}/${TRASH_DIRNAME}/`)).toBe(true);
    expect(await exists(join(fixture.root, trashRel))).toBe(true);
  });
});
