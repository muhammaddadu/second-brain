import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  createEmbeddingProvider,
  decodeVector,
  encodeVector,
  fuseRankings,
} from './embeddings.js';

describe('cosineSimilarity', () => {
  it('is 1 for identical directions, 0 for orthogonal, and safe for mismatched/zero', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0); // length mismatch
  });
});

describe('vector encode/decode', () => {
  it('round-trips through float32 BLOB bytes', () => {
    const v = [0.5, -1.25, 3, 0];
    expect(decodeVector(encodeVector(v))).toEqual(v);
  });
});

describe('fuseRankings (RRF)', () => {
  it('ranks a note appearing in both lists above single-list notes', () => {
    const fused = fuseRankings(['a', 'b', 'c'], ['b', 'x']);
    expect(fused[0]).toBe('b'); // in both → highest combined score
    expect(fused).toContain('x'); // semantic-only survives
    expect(new Set(fused).size).toBe(fused.length); // no dupes
  });

  it('preserves order when one list is empty', () => {
    expect(fuseRankings(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('createEmbeddingProvider', () => {
  it('returns null when off or misconfigured', () => {
    expect(createEmbeddingProvider({ provider: 'off', baseUrl: 'x', model: 'm' })).toBeNull();
    expect(
      createEmbeddingProvider({ provider: 'openai-compatible', baseUrl: '', model: 'm' }),
    ).toBeNull();
    expect(
      createEmbeddingProvider({ provider: 'openai-compatible', baseUrl: 'x', model: '' }),
    ).toBeNull();
  });

  it('POSTs the OpenAI /embeddings shape and parses data[].embedding', async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: JSON.parse(String(init.body)),
        auth: (init.headers as Record<string, string>).authorization ?? null,
      });
      const input = JSON.parse(String(init.body)).input as string[];
      return {
        ok: true,
        json: async () => ({ data: input.map((_, i) => ({ embedding: [i, i + 1] })) }),
      };
    }) as unknown as typeof fetch;
    try {
      const provider = createEmbeddingProvider({
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1/',
        model: 'nomic-embed-text',
        apiKey: 'secret',
      });
      const vecs = await provider?.embed(['hello', 'world']);
      expect(vecs).toEqual([
        [0, 1],
        [1, 2],
      ]);
      expect(calls[0]?.url).toBe('http://localhost:11434/v1/embeddings'); // trailing slash normalized
      expect(calls[0]?.auth).toBe('Bearer secret');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('throws on a non-OK response', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 500,
      statusText: 'err',
    })) as unknown as typeof fetch;
    try {
      const provider = createEmbeddingProvider({
        provider: 'openai-compatible',
        baseUrl: 'http://x/v1',
        model: 'm',
      });
      await expect(provider?.embed(['a'])).rejects.toThrow(/500/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
