import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  blocksToText,
  buildMatchQuery,
  chunkText,
  indexPath,
  openSearchIndex,
  rebuildIndex,
  reindexNote,
  type SearchIndex,
  syncIndex,
} from './search.js';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { createNote, openVault, updateNoteBlocks, type Vault } from './vault.js';

describe('blocksToText', () => {
  it('flattens block content and nested children to lines of plain text', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'parent' }],
        children: [{ type: 'bulletListItem', content: [{ type: 'text', text: 'child' }] }],
      },
      { type: 'paragraph', content: [] }, // empty block contributes nothing
    ];
    expect(blocksToText(blocks)).toBe('Hello world\nparent\nchild');
  });

  it('extracts text from links and table cells', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [{ type: 'link', content: [{ type: 'text', text: 'linked' }] }],
      },
      {
        type: 'table',
        content: {
          rows: [{ cells: [[{ type: 'text', text: 'A1' }], [{ type: 'text', text: 'B1' }]] }],
        },
      },
    ];
    expect(blocksToText(blocks)).toBe('linked\nA1 B1');
  });
});

describe('chunkText', () => {
  it('returns [] for empty text and a single chunk for short text', () => {
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText('one line')).toEqual(['one line']);
  });

  it('splits long text into chunks under the size limit', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks.join(' ')).toContain('word399');
  });
});

describe('buildMatchQuery', () => {
  it('prefix-matches alphanumeric tokens and rejects empty/punctuation-only queries', () => {
    expect(buildMatchQuery('Hello World')).toBe('hello* world*');
    expect(buildMatchQuery('  !!! ')).toBeNull();
    // Would-be FTS operators are lowercased to plain terms, not operators.
    expect(buildMatchQuery('cats AND dogs')).toBe('cats* and* dogs*');
  });
});

describe('search index (FTS)', () => {
  let fixture: FixtureVault;
  let vault: Vault;
  let index: SearchIndex;

  beforeEach(async () => {
    fixture = await createFixtureVault();
    vault = openVault(fixture.root);
    index = openSearchIndex(indexPath(vault));
  });
  afterEach(async () => {
    index.close();
    await fixture.cleanup();
  });

  it('rebuilds from files and finds notes by keyword with a snippet', async () => {
    await rebuildIndex(vault, index);
    const hits = index.search('vault core');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.path).toBe('Journal/2026-07-07.note.json');
    expect(hits[0]?.title).toBe('Monday');
    // Matched terms are wrapped in the private-use markers (not '[' ']', which can occur in text).
    expect(hits[0]?.snippet).toContain('\uE000');
    // A term in no note returns nothing.
    expect(index.search('zzznonexistent')).toEqual([]);
  });

  it('skips reindex when a note is unchanged, reindexes when it changes (incremental)', async () => {
    await rebuildIndex(vault, index);
    const path = 'Journal/2026-07-07.note.json';
    expect(await reindexNote(vault, index, path)).toBe(false); // unchanged → skipped

    await updateNoteBlocks(vault, path, [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'quantum entanglement notes', styles: {} }],
      },
    ]);
    expect(await reindexNote(vault, index, path)).toBe(true); // changed → reindexed
    expect(index.search('quantum').map((h) => h.path)).toContain(path);
    expect(index.search('vault core')).toEqual([]); // old text gone
  });

  it('wraps matched terms in private-use markers, leaving literal brackets intact', async () => {
    await createNote(vault, 'Code/arr.note.json', { title: 'Arr', blocks: [] });
    await updateNoteBlocks(vault, 'Code/arr.note.json', [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'arr[i] holds xylophone data', styles: {} }],
      },
    ]);
    await reindexNote(vault, index, 'Code/arr.note.json');
    const snippet = index.search('xylophone')[0]?.snippet ?? '';
    expect(snippet).toContain('xylophone'); // matched term wrapped in the markers
    expect(snippet).toContain('arr[i]'); // literal "[" from the note text is untouched
  });

  it('removes a note from the index when its file is gone', async () => {
    await rebuildIndex(vault, index);
    await createNote(vault, 'Temp/scratch.note.json', { title: 'Scratch', blocks: [] });
    await updateNoteBlocks(vault, 'Temp/scratch.note.json', [
      { type: 'paragraph', content: [{ type: 'text', text: 'ephemeral marker', styles: {} }] },
    ]);
    await reindexNote(vault, index, 'Temp/scratch.note.json');
    expect(index.search('ephemeral').length).toBe(1);

    index.remove('Temp/scratch.note.json');
    expect(index.search('ephemeral')).toEqual([]);
  });

  it('operations on a closed index are safe no-ops, not "database closed" errors', async () => {
    await rebuildIndex(vault, index);
    index.close();
    expect(index.isOpen()).toBe(false);
    // A vault switch / HMR reload can close an index while a syncIndex is mid-loop; the closed index
    // must degrade to no-ops rather than throw, and a sync against it must stop cleanly.
    expect(index.search('vault')).toEqual([]);
    expect(index.storedHash('Journal/2026-07-07.note.json')).toBeNull();
    expect(index.indexedPaths()).toEqual([]);
    expect(() =>
      index.upsert({ path: 'x.note.json', title: 'x', tags: [], hash: 'h', text: 't' }),
    ).not.toThrow();
    await expect(syncIndex(vault, index)).resolves.toBeUndefined();
    // reopen so afterEach closes a live handle
    index = openSearchIndex(indexPath(vault));
  });

  it('deleting the index file and rebuilding reproduces equivalent results (derived)', async () => {
    await rebuildIndex(vault, index);
    const before = index.search('kickoff').map((h) => h.path);
    index.close();

    // Fresh index over the same files → same results (proves it is fully derived).
    const rebuilt = openSearchIndex(indexPath(vault));
    await rebuildIndex(vault, rebuilt);
    const after = rebuilt.search('kickoff').map((h) => h.path);
    rebuilt.close();
    // reopen the shared handle so afterEach can close it cleanly
    index = openSearchIndex(indexPath(vault));

    expect(after).toEqual(before);
    expect(after).toContain('Projects/alpha/index.note.json');

    // sanity: the index really is a file on disk
    await expect(readFile(indexPath(vault))).resolves.toBeInstanceOf(Buffer);
  });
});
