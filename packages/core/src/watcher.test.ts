import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { createNote, openVault } from './vault.js';
import { isReservedPath, toVaultRelative, type VaultChange, watchVault } from './watcher.js';

describe('watcher path helpers (pure)', () => {
  it('converts absolute paths to vault-relative POSIX paths', () => {
    expect(toVaultRelative('/vault', '/vault/Journal/a.note.json')).toBe('Journal/a.note.json');
  });

  it('flags reserved .brain paths', () => {
    expect(isReservedPath('/vault', '/vault/.brain/index.db')).toBe(true);
    expect(isReservedPath('/vault', '/vault/Journal/a.note.json')).toBe(false);
  });
});

describe('watchVault (live)', () => {
  let fixture: FixtureVault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('emits an event when a note is created outside the watcher', async () => {
    const vault = openVault(fixture.root);
    const events: VaultChange[] = [];
    const watcher = watchVault(vault, (e) => events.push(e));
    try {
      // Wait until chokidar has attached, else the create fires before we're watching (flaky in CI).
      await watcher.ready;
      await createNote(vault, 'Inbox/watched.note.json', { title: 'Watched' });
      await vi.waitFor(
        () => expect(events.some((e) => e.path === 'Inbox/watched.note.json')).toBe(true),
        { timeout: 4000, interval: 100 },
      );
    } finally {
      await watcher.close();
    }
  });

  it('ignores writes inside the reserved .brain directory', async () => {
    const vault = openVault(fixture.root);
    const events: VaultChange[] = [];
    const watcher = watchVault(vault, (e) => events.push(e));
    try {
      await watcher.ready;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(fixture.root, '.brain', 'scratch.txt'), 'x', 'utf8');
      await createNote(vault, 'after.note.json', {}); // a real event to wait on
      await vi.waitFor(() => expect(events.some((e) => e.path === 'after.note.json')).toBe(true), {
        timeout: 4000,
        interval: 100,
      });
      expect(events.some((e) => e.path.includes('.brain'))).toBe(false);
    } finally {
      await watcher.close();
    }
  });
});
