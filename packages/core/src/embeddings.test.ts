import { afterEach, describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  createEmbeddingAdapter,
  decodeVector,
  encodeVector,
  fuseRankings,
  scanLocalProviders,
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

describe('createEmbeddingAdapter', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('returns null when a config is incomplete', async () => {
    expect(
      await createEmbeddingAdapter({ kind: 'openai-compatible', baseUrl: '', model: 'm' }),
    ).toBeNull();
    expect(await createEmbeddingAdapter({ kind: 'ollama', baseUrl: 'x', model: '' })).toBeNull();
    expect(await createEmbeddingAdapter({ kind: 'bedrock', model: '' })).toBeNull();
  });

  it('reports privacy mode per provider kind', async () => {
    const ollama = await createEmbeddingAdapter({
      kind: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
    });
    const openai = await createEmbeddingAdapter(
      { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
      { apiKey: 'k' },
    );
    expect(ollama?.privacyMode()).toBe('local');
    expect(openai?.privacyMode()).toBe('hosted');
  });

  it('POSTs the OpenAI /embeddings shape, sends the key, and parses data[].embedding', async () => {
    const calls: Array<{ url: string; auth: string | null; body: unknown }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        auth: (init.headers as Record<string, string>).authorization ?? null,
        body: JSON.parse(String(init.body)),
      });
      const input = JSON.parse(String(init.body)).input as string[];
      return {
        ok: true,
        json: async () => ({ data: input.map((_, i) => ({ embedding: [i, i + 1] })) }),
      };
    }) as unknown as typeof fetch;

    const adapter = await createEmbeddingAdapter(
      { kind: 'openai-compatible', baseUrl: 'http://host/v1/', model: 'm' },
      { apiKey: 'secret' },
    );
    const vecs = await adapter?.embed(['a', 'b']);
    expect(vecs).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(calls[0]?.url).toBe('http://host/v1/embeddings'); // trailing slash normalized
    expect(calls[0]?.auth).toBe('Bearer secret');
  });

  it('testConnection returns a plain-language failure when the endpoint is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;
    const adapter = await createEmbeddingAdapter({
      kind: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
    });
    const result = await adapter?.testConnection();
    expect(result?.ok).toBe(false);
    expect(result?.message).toMatch(/running/i);
  });
});

describe('scanLocalProviders', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('marks a reachable runtime running with its models, others failed', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('11434')) {
        return { ok: true, json: async () => ({ data: [{ id: 'nomic-embed-text' }] }) };
      }
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const found = await scanLocalProviders();
    const ollama = found.find((p) => p.kind === 'ollama');
    const lmstudio = found.find((p) => p.kind === 'lmstudio');
    expect(ollama?.status).toBe('running');
    expect(ollama?.models).toContain('nomic-embed-text');
    expect(lmstudio?.status).toBe('connection-failed');
  });
});
