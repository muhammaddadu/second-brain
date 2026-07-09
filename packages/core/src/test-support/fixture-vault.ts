/**
 * Test harness: a throwaway temp-dir vault seeded with synthetic notes. Real files on disk so
 * tests exercise the true I/O path (AGENTS.md: temp-dir fixture vaults, synthetic notes only —
 * never a personal vault). Callers must `cleanup()` when done.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type NoteEnvelope, serializeNote } from '../envelope.js';
import { BRAIN_DIR, INDEX_DB, RULES_FILE } from '../paths.js';

export interface FixtureVault {
  /** Absolute path to the temp vault root. */
  root: string;
  /** Remove the temp directory. */
  cleanup: () => Promise<void>;
}

/** A fixed timestamp so fixture notes and deterministic-clock tests are reproducible. */
export const FIXTURE_TIMESTAMP = '2026-07-09T12:00:00.000Z';

function synthNote(title: string, tags: string[], text: string): NoteEnvelope {
  return {
    version: 1,
    meta: { title, tags, created: FIXTURE_TIMESTAMP, updated: FIXTURE_TIMESTAMP },
    blocks: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text, styles: {} }],
      },
    ],
  };
}

/** The synthetic notes seeded into every fixture vault, by vault-relative path. */
export const FIXTURE_NOTES: Record<string, NoteEnvelope> = {
  'Journal/2026-07-07.note.json': synthNote('Monday', ['journal'], 'Shipped the vault core.'),
  'Projects/alpha/index.note.json': synthNote('Alpha', ['project-x', 'decisions'], 'Kickoff.'),
};

/**
 * Create a fresh temp-dir vault with {@link FIXTURE_NOTES}, a RULES.md, and a placeholder
 * `.brain/index.db` (to prove the tree ignores reserved internals).
 */
export async function createFixtureVault(): Promise<FixtureVault> {
  const root = await mkdtemp(join(tmpdir(), 'brain-vault-'));

  for (const [relPath, note] of Object.entries(FIXTURE_NOTES)) {
    const abs = join(root, relPath);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, serializeNote(note), 'utf8');
  }

  await writeFile(
    join(root, RULES_FILE),
    '# Rules\n\nSummarise the last 24 hours daily.\n',
    'utf8',
  );
  await mkdir(join(root, BRAIN_DIR), { recursive: true });
  await writeFile(join(root, BRAIN_DIR, INDEX_DB), '', 'utf8');

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
