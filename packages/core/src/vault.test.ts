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
  createNote,
  hashNote,
  moveNote,
  openVault,
  readNote,
  renameNote,
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
