import { describe, expect, it } from 'vitest';
import type { GraphData } from './graph.js';
import { ALL_EDGE_KINDS, multiHopRecall, parseEdgeKinds, type RecallHit } from './recall.js';

function graph(partial: GraphData): GraphData {
  return partial;
}

function hitPaths(hits: RecallHit[]): string[] {
  return hits.map((h) => h.path);
}

describe('parseEdgeKinds', () => {
  it('parses a comma list', () => {
    expect(parseEdgeKinds('link, tag')).toEqual(['link', 'tag']);
  });

  it('rejects unknown kinds', () => {
    expect(() => parseEdgeKinds('link,magic')).toThrow(/unknown/);
  });
});

describe('multiHopRecall', () => {
  const chain: GraphData = graph({
    nodes: [
      { path: 'a.note.json', title: 'A', tags: [] },
      { path: 'b.note.json', title: 'B', tags: [] },
      { path: 'c.note.json', title: 'C', tags: [] },
      { path: 'd.note.json', title: 'D', tags: [] },
    ],
    edges: [
      { source: 'a.note.json', target: 'b.note.json', weight: 1, kind: 'link' },
      { source: 'b.note.json', target: 'c.note.json', weight: 0.8, kind: 'tag' },
      { source: 'c.note.json', target: 'd.note.json', weight: 0.7, kind: 'semantic' },
    ],
  });

  it('returns 1-hop neighbours of the seed', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 1 });
    expect(hitPaths(result.hits)).toEqual(['b.note.json']);
    expect(result.hits[0]?.distance).toBe(1);
    expect(result.hits[0]?.via[0]?.kind).toBe('link');
    expect(result.hits[0]?.trail).toEqual(['a.note.json', 'b.note.json']);
  });

  it('walks two hops along the shortest trail', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 2 });
    expect(hitPaths(result.hits)).toEqual(['b.note.json', 'c.note.json']);
    const two = result.hits.find((h) => h.path === 'c.note.json');
    expect(two?.distance).toBe(2);
    expect(two?.trail).toEqual(['a.note.json', 'b.note.json', 'c.note.json']);
    expect(two?.via.map((e) => e.kind)).toEqual(['link', 'tag']);
  });

  it('reaches three hops when asked', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 3 });
    expect(hitPaths(result.hits)).toEqual(['b.note.json', 'c.note.json', 'd.note.json']);
  });

  it('filters by edge kind (link only skips tag/semantic hops)', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 3, kinds: ['link'] });
    expect(hitPaths(result.hits)).toEqual(['b.note.json']);
  });

  it('treats a both edge as matching tag or semantic filters', () => {
    const g = graph({
      nodes: [
        { path: 'a.note.json', title: 'A', tags: [] },
        { path: 'b.note.json', title: 'B', tags: [] },
      ],
      edges: [{ source: 'a.note.json', target: 'b.note.json', weight: 0.9, kind: 'both' }],
    });
    expect(hitPaths(multiHopRecall(g, 'a.note.json', { kinds: ['tag'] }).hits)).toEqual([
      'b.note.json',
    ]);
    expect(hitPaths(multiHopRecall(g, 'a.note.json', { kinds: ['semantic'] }).hits)).toEqual([
      'b.note.json',
    ]);
    expect(hitPaths(multiHopRecall(g, 'a.note.json', { kinds: ['link'] }).hits)).toEqual([]);
  });

  it('prefers the shortest path when a longer route also exists', () => {
    const g = graph({
      nodes: [
        { path: 'a.note.json', title: 'A', tags: [] },
        { path: 'b.note.json', title: 'B', tags: [] },
        { path: 'c.note.json', title: 'C', tags: [] },
      ],
      edges: [
        { source: 'a.note.json', target: 'c.note.json', weight: 0.5, kind: 'tag' },
        { source: 'a.note.json', target: 'b.note.json', weight: 1, kind: 'link' },
        { source: 'b.note.json', target: 'c.note.json', weight: 1, kind: 'link' },
      ],
    });
    const result = multiHopRecall(g, 'a.note.json', { hops: 2 });
    const c = result.hits.find((h) => h.path === 'c.note.json');
    expect(c?.distance).toBe(1);
    expect(c?.via).toHaveLength(1);
  });

  it('caps results with limit', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 3, limit: 1 });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.path).toBe('b.note.json');
  });

  it('returns empty hits for an unknown seed', () => {
    const result = multiHopRecall(chain, 'missing.note.json', { hops: 2 });
    expect(result.hits).toEqual([]);
    expect(result.seed.path).toBe('missing.note.json');
  });

  it('defaults kinds to all edge kinds', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 1 });
    expect(result.kinds).toEqual([...ALL_EDGE_KINDS]);
  });

  it('clamps hops to MAX_RECALL_HOPS', () => {
    const result = multiHopRecall(chain, 'a.note.json', { hops: 99 });
    expect(result.hops).toBe(5);
  });
});
