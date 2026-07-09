import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTags, parseNote, serializeNote, setTags } from './envelope.js';
import { InvalidPathError, NoteExistsError } from './errors.js';
import { BRAIN_DIR, TRASH_DIRNAME } from './paths.js';
import {
  createFixtureVault,
  FIXTURE_TIMESTAMP,
  type FixtureVault,
} from './test-support/fixture-vault.js';
import {
  createNote,
  moveNote,
  openVault,
  readNote,
  renameNote,
  trashNote,
  type Vault,
  writeNote,
} from './vault.js';

async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

describe('vault operations', () => {
  let fixture: FixtureVault;
  let vault: Vault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
    vault = openVault(fixture.root, { now: () => FIXTURE_TIMESTAMP });
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('reads an existing note into an envelope', async () => {
    const note = await readNote(vault, 'Journal/2026-07-07.note.json');
    expect(note.meta.title).toBe('Monday');
    expect(getTags(note)).toEqual(['journal']);
  });

  it('creates a note with version/created/updated filled in', async () => {
    const note = await createNote(vault, 'Inbox/new.note.json', { title: 'New', tags: ['todo'] });
    expect(note.version).toBe(1);
    expect(note.meta.created).toBe(FIXTURE_TIMESTAMP);
    expect(note.meta.updated).toBe(FIXTURE_TIMESTAMP);

    const onDisk = parseNote(await readFile(join(fixture.root, 'Inbox/new.note.json'), 'utf8'));
    expect(onDisk.meta.title).toBe('New');
    expect(getTags(onDisk)).toEqual(['todo']);
  });

  it('refuses to overwrite an existing note on create', async () => {
    await expect(createNote(vault, 'Journal/2026-07-07.note.json')).rejects.toBeInstanceOf(
      NoteExistsError,
    );
  });

  it('rejects paths that escape the vault or hit reserved internals', async () => {
    await expect(readNote(vault, '../outside.note.json')).rejects.toBeInstanceOf(InvalidPathError);
    await expect(readNote(vault, '.brain/x.note.json')).rejects.toBeInstanceOf(InvalidPathError);
    await expect(readNote(vault, 'notanote.txt')).rejects.toBeInstanceOf(InvalidPathError);
  });

  it('renames a note within its folder', async () => {
    const toRel = await renameNote(vault, 'Journal/2026-07-07.note.json', 'monday.note.json');
    expect(toRel).toBe('Journal/monday.note.json');
    expect(await exists(join(fixture.root, 'Journal/monday.note.json'))).toBe(true);
    expect(await exists(join(fixture.root, 'Journal/2026-07-07.note.json'))).toBe(false);
  });

  it('moves a note across folders and refuses to clobber', async () => {
    await moveNote(vault, 'Journal/2026-07-07.note.json', 'Archive/2026/mon.note.json');
    expect(await exists(join(fixture.root, 'Archive/2026/mon.note.json'))).toBe(true);

    await expect(
      moveNote(vault, 'Projects/alpha/index.note.json', 'Archive/2026/mon.note.json'),
    ).rejects.toBeInstanceOf(NoteExistsError);
  });

  it('trashes a note instead of deleting it permanently', async () => {
    const trashRel = await trashNote(vault, 'Journal/2026-07-07.note.json');
    expect(trashRel.startsWith(`${BRAIN_DIR}/${TRASH_DIRNAME}/`)).toBe(true);
    expect(await exists(join(fixture.root, 'Journal/2026-07-07.note.json'))).toBe(false);
    expect(await exists(join(fixture.root, trashRel))).toBe(true); // recoverable
  });

  it('persists tag edits via writeNote', async () => {
    const note = await readNote(vault, 'Projects/alpha/index.note.json');
    await writeNote(vault, 'Projects/alpha/index.note.json', setTags(note, ['renamed']));
    const reread = await readNote(vault, 'Projects/alpha/index.note.json');
    expect(getTags(reread)).toEqual(['renamed']);
  });

  it('writes deterministic serialised bytes', async () => {
    const note = await readNote(vault, 'Journal/2026-07-07.note.json');
    await writeNote(vault, 'Journal/2026-07-07.note.json', note);
    const bytes = await readFile(join(fixture.root, 'Journal/2026-07-07.note.json'), 'utf8');
    expect(bytes).toBe(
      serializeNote({ ...note, meta: { ...note.meta, updated: FIXTURE_TIMESTAMP } }),
    );
    expect(bytes.endsWith('}\n')).toBe(true);
  });
});
