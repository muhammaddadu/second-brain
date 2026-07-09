import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGraph } from './graph.js';
import { indexPath, openSearchIndex, type SearchIndex } from './search.js';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { createNote, openVault, updateNoteTags, type Vault } from './vault.js';

describe('buildGraph', () => {
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

  it('links notes that share a tag, and leaves tag-less notes unconnected', async () => {
    index.upsert({ path: 'a.note.json', title: 'A', tags: ['x', 'y'], hash: '1', text: 'a' });
    index.upsert({ path: 'b.note.json', title: 'B', tags: ['y'], hash: '2', text: 'b' });
    index.upsert({ path: 'c.note.json', title: 'C', tags: [], hash: '3', text: 'c' });

    const graph = buildGraph(index); // tag-only (no model)
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    expect(edge?.kind).toBe('tag');
    expect([edge?.source, edge?.target].sort()).toEqual(['a.note.json', 'b.note.json']);
    expect(edge?.weight).toBeCloseTo(1 / 2); // shared {y} over union {x,y}
  });

  it('is derived from the index — rebuilding reproduces the same nodes and edges', async () => {
    const vault2 = openVault(fixture.root);
    await createNote(vault2, 'One.note.json', { title: 'One' });
    await createNote(vault2, 'Two.note.json', { title: 'Two' });
    await updateNoteTags(vault2, 'One.note.json', ['shared']);
    await updateNoteTags(vault2, 'Two.note.json', ['shared']);

    index.upsert({ path: 'One.note.json', title: 'One', tags: ['shared'], hash: 'a', text: 'one' });
    index.upsert({ path: 'Two.note.json', title: 'Two', tags: ['shared'], hash: 'b', text: 'two' });
    const before = buildGraph(index);
    index.close();

    const rebuilt = openSearchIndex(indexPath(vault));
    rebuilt.upsert({
      path: 'One.note.json',
      title: 'One',
      tags: ['shared'],
      hash: 'a',
      text: 'one',
    });
    rebuilt.upsert({
      path: 'Two.note.json',
      title: 'Two',
      tags: ['shared'],
      hash: 'b',
      text: 'two',
    });
    const after = buildGraph(rebuilt);
    rebuilt.close();
    index = openSearchIndex(indexPath(vault));

    expect(after.edges).toEqual(before.edges);
    expect(after.nodes.map((n) => n.path).sort()).toEqual(before.nodes.map((n) => n.path).sort());
  });

  it('adds semantic edges above the threshold and merges them with tag edges', () => {
    // Two notes: same tag AND (via injected vectors) high similarity → one merged "both" edge.
    index.upsert({ path: 'sea.note.json', title: 'Sea', tags: ['nature'], hash: '1', text: 'sea' });
    index.upsert({
      path: 'tide.note.json',
      title: 'Tide',
      tags: ['nature'],
      hash: '2',
      text: 'tide',
    });
    index.upsert({ path: 'rock.note.json', title: 'Rock', tags: ['geo'], hash: '3', text: 'rock' });
    // Inject note-level vectors by setting a single chunk embedding per note.
    // (chunk ids are 1..3 in insertion order.)
    index.setEmbedding(1, 'm', [1, 0]);
    index.setEmbedding(2, 'm', [0.99, 0.14]); // ~close to sea → semantic edge
    index.setEmbedding(3, 'm', [0, 1]); // orthogonal → no semantic edge

    const graph = buildGraph(index, { model: 'm', threshold: 0.6 });
    const seaTide = graph.edges.find(
      (e) => [e.source, e.target].sort().join() === 'sea.note.json,tide.note.json',
    );
    expect(seaTide?.kind).toBe('both'); // shared tag + high similarity
    // rock only shares nothing → no edge to it
    expect(
      graph.edges.some((e) => e.source === 'rock.note.json' || e.target === 'rock.note.json'),
    ).toBe(false);
  });
});
