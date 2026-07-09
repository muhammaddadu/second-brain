import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTags, parseNote } from './envelope.js';
import {
  exportNoteToMarkdown,
  exportVaultToMarkdown,
  importMarkdownAsNote,
} from './import-export.js';
import {
  createFixtureVault,
  FIXTURE_TIMESTAMP,
  type FixtureVault,
} from './test-support/fixture-vault.js';
import { openVault, readNote, type Vault } from './vault.js';

describe('markdown import/export', () => {
  let fixture: FixtureVault;
  let vault: Vault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
    vault = openVault(fixture.root, { now: () => FIXTURE_TIMESTAMP });
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('imports Markdown as a valid note with metadata', async () => {
    await importMarkdownAsNote(vault, 'Inbox/imported.note.json', '# Imported\n\nBody text.\n', {
      title: 'Imported',
      tags: ['md'],
    });
    const note = await readNote(vault, 'Inbox/imported.note.json');
    expect(note.version).toBe(1);
    expect(note.meta.title).toBe('Imported');
    expect(getTags(note)).toEqual(['md']);
    expect(note.blocks.length).toBeGreaterThan(0);
  });

  it('round-trips Markdown import → export back to readable Markdown', async () => {
    const source = '# Notes\n\nA point:\n\n- alpha\n- beta\n';
    await importMarkdownAsNote(vault, 'Inbox/rt.note.json', source);
    const exported = await exportNoteToMarkdown(vault, 'Inbox/rt.note.json');
    expect(exported).toContain('# Notes');
    expect(exported).toContain('alpha');
    expect(exported).toContain('beta');
  });

  it('exports the whole vault to Markdown files mirroring the tree', async () => {
    const destDir = join(fixture.root, 'export-out');
    const written = await exportVaultToMarkdown(vault, destDir);

    // Fixture has notes in Journal/ and Projects/alpha/.
    expect(written).toContain('Journal/2026-07-07.md');
    expect(written).toContain('Projects/alpha/index.md');

    const journalMd = await readFile(join(destDir, 'Journal/2026-07-07.md'), 'utf8');
    expect(journalMd).toContain('Shipped the vault core.');

    // Export is a view — the source note JSON is unchanged and still valid.
    const stillJson = parseNote(
      await readFile(join(fixture.root, 'Journal/2026-07-07.note.json'), 'utf8'),
    );
    expect(stillJson.version).toBe(1);
  });
});
