import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTags, parseNote, serializeNote, setTags } from './envelope.js';
import { InvalidPathError, NoteConflictError, NoteExistsError } from './errors.js';
import { BRAIN_DIR, TRASH_DIRNAME } from './paths.js';
import {
  createFixtureVault,
  FIXTURE_TIMESTAMP,
  type FixtureVault,
} from './test-support/fixture-vault.js';
import {
  createFolder,
  createFolderWithUniqueName,
  createNote,
  createNoteWithUniqueName,
  hashNote,
  moveNote,
  openVault,
  readNote,
  renameNote,
  setNoteTitle,
  titleToFilenameBase,
  trashNote,
  updateNoteBlocks,
  updateNoteBlocksGuarded,
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

  it('initVault marks a plain directory as a vault (idempotent)', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'brain-init-'));
    try {
      const { initVault, isVault } = await import('./vault.js');
      expect(await isVault(dir)).toBe(false);
      await initVault(dir, () => FIXTURE_TIMESTAMP);
      expect(await isVault(dir)).toBe(true);
      await initVault(dir, () => FIXTURE_TIMESTAMP); // idempotent — no throw
      expect(await isVault(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('createFolder makes an empty directory in the vault', async () => {
    await createFolder(vault, 'Archive/2026');
    expect(await exists(join(fixture.root, 'Archive/2026'))).toBe(true);
    await expect(createFolder(vault, '../escape')).rejects.toBeInstanceOf(InvalidPathError);
  });

  it('renames and trashes a folder (with its contents)', async () => {
    const { renameFolder, trashFolder } = await import('./vault.js');
    const toRel = await renameFolder(vault, 'Projects', 'Work');
    expect(toRel).toBe('Work');
    expect(await exists(join(fixture.root, 'Work/alpha/index.note.json'))).toBe(true); // content moved
    expect(await exists(join(fixture.root, 'Projects'))).toBe(false);
    await expect(renameFolder(vault, 'Work', 'bad/name')).rejects.toBeInstanceOf(InvalidPathError);

    const trashRel = await trashFolder(vault, 'Work');
    expect(trashRel.startsWith(`${BRAIN_DIR}/${TRASH_DIRNAME}/`)).toBe(true);
    expect(await exists(join(fixture.root, 'Work'))).toBe(false); // recoverable, not gone
    expect(await exists(join(fixture.root, trashRel))).toBe(true);
  });

  it('guarded save succeeds when the file is unchanged and rejects when it changed', async () => {
    const path = 'Journal/2026-07-07.note.json';
    const baseHash = await hashNote(vault, path);

    // Unchanged → guarded save succeeds and returns a new hash.
    const newHash = await updateNoteBlocksGuarded(vault, path, [{ type: 'paragraph' }], baseHash);
    expect(newHash).not.toBe(baseHash);

    // Simulate an external write, then a guarded save against the now-stale hash → conflict.
    await updateNoteBlocks(vault, path, [{ type: 'paragraph', content: [] }]);
    await expect(
      updateNoteBlocksGuarded(vault, path, [{ type: 'heading' }], newHash),
    ).rejects.toBeInstanceOf(NoteConflictError);
  });

  it('renameNote rejects names with a bad extension or a path separator', async () => {
    const path = 'Journal/2026-07-07.note.json';
    await expect(renameNote(vault, path, 'no-extension')).rejects.toBeInstanceOf(InvalidPathError);
    await expect(renameNote(vault, path, 'a/b.note.json')).rejects.toBeInstanceOf(InvalidPathError);
  });

  it('guarded save on a note that no longer exists rejects (not a silent success)', async () => {
    const path = 'Journal/2026-07-07.note.json';
    const baseHash = await hashNote(vault, path);
    await trashNote(vault, path); // the note is gone from its path
    await expect(
      updateNoteBlocksGuarded(vault, path, [{ type: 'paragraph' }], baseHash),
    ).rejects.toBeTruthy();
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

describe('naming policy (title → filename, unique names)', () => {
  let fixture: FixtureVault;
  let vault: Vault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
    vault = openVault(fixture.root);
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('titleToFilenameBase strips separators/leading dots and collapses spaces', () => {
    expect(titleToFilenameBase('a/b\\c')).toBe('a-b-c');
    expect(titleToFilenameBase('..hidden')).toBe('hidden');
    expect(titleToFilenameBase('  many   spaces  ')).toBe('many spaces');
  });

  it('createNoteWithUniqueName de-dupes with numeric suffixes', async () => {
    expect(await createNoteWithUniqueName(vault, 'Inbox', 'Untitled')).toBe(
      'Inbox/Untitled.note.json',
    );
    expect(await createNoteWithUniqueName(vault, 'Inbox', 'Untitled')).toBe(
      'Inbox/Untitled 1.note.json',
    );
    expect(await createNoteWithUniqueName(vault, 'Inbox', 'Untitled')).toBe(
      'Inbox/Untitled 2.note.json',
    );
  });

  it('createFolderWithUniqueName de-dupes against existing tree entries', async () => {
    expect(await createFolderWithUniqueName(vault, '', 'New folder')).toBe('New folder');
    expect(await createFolderWithUniqueName(vault, '', 'New folder')).toBe('New folder 1');
  });

  it('setNoteTitle updates the title and renames the file to match (sanitized, de-duped)', async () => {
    const path = await createNoteWithUniqueName(vault, 'Inbox', 'Untitled');
    const result = await setNoteTitle(vault, path, 'My idea / draft');
    expect(result).toEqual({ path: 'Inbox/My idea - draft.note.json', title: 'My idea / draft' });
    const note = await readNote(vault, result.path);
    expect(note.meta.title).toBe('My idea / draft');

    // Colliding title → numeric suffix, never a clobber.
    const other = await createNoteWithUniqueName(vault, 'Inbox', 'Other');
    const collided = await setNoteTitle(vault, other, 'My idea / draft');
    expect(collided.path).toBe('Inbox/My idea - draft 1.note.json');

    // Blank title is a no-op; same-title rename is a no-op.
    expect(await setNoteTitle(vault, collided.path, '   ')).toEqual({
      path: collided.path,
      title: '',
    });
    expect((await setNoteTitle(vault, collided.path, 'My idea / draft')).path).toBe(collided.path);
  });
});
