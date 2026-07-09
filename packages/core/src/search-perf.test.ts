/**
 * Performance acceptance for E4 (PRD §4.3): keyword search over a generated 1000-note vault returns
 * in well under a second. Builds a real on-disk vault, indexes it, then times an actual `search`
 * call (the build/index cost is setup, not what we assert). The 1 s bound is generous — real times
 * are single-digit milliseconds — so this guards against a regression, not micro-fluctuations.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeNote } from './envelope.js';
import { indexPath, openSearchIndex, rebuildIndex, type SearchIndex } from './search.js';
import { initVault, openVault, type Vault } from './vault.js';

const NOTE_COUNT = 1000;
const FOLDERS = 20;
const VOCAB = [
  'project',
  'meeting',
  'idea',
  'ocean',
  'mountain',
  'recipe',
  'budget',
  'travel',
  'music',
  'garden',
  'code',
  'design',
  'history',
  'science',
  'poem',
  'letter',
  'plan',
  'review',
  'summary',
  'archive',
];

describe('search performance (E4, PRD §4.3)', () => {
  let root: string;
  let vault: Vault;
  let index: SearchIndex;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-perf-'));
    await initVault(root); // creates .brain/ so the index db can be opened
    vault = openVault(root);
  });
  afterEach(async () => {
    index?.close();
    await rm(root, { recursive: true, force: true });
  });

  it('searches a 1000-note vault in under a second', async () => {
    for (let f = 0; f < FOLDERS; f += 1) {
      await mkdir(join(root, `Folder${f}`), { recursive: true });
    }
    await Promise.all(
      Array.from({ length: NOTE_COUNT }, (_, i) => {
        const text =
          `This note ${i} covers ${VOCAB[i % VOCAB.length]} and ${VOCAB[(i * 7) % VOCAB.length]} ` +
          `with detail about ${VOCAB[(i * 3) % VOCAB.length]}. Every entry mentions the vault.`;
        const note = serializeNote({
          version: 1,
          meta: { title: `Note ${i}`, tags: [VOCAB[i % VOCAB.length] ?? 'misc'] },
          blocks: [{ type: 'paragraph', content: [{ type: 'text', text, styles: {} }] }],
        });
        return writeFile(join(root, `Folder${i % FOLDERS}`, `note-${i}.note.json`), note, 'utf8');
      }),
    );

    index = openSearchIndex(indexPath(vault));
    await rebuildIndex(vault, index);

    index.search('warmup'); // prime caches / query planner

    // Worst case: a term in every note (max rows scanned before de-dup to distinct notes).
    const start = performance.now();
    const hits = index.search('vault');
    const elapsed = performance.now() - start;

    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);
});
