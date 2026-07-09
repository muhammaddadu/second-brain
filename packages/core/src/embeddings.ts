/**
 * Embeddings (E4 semantic leg, ADR 0007). A pluggable embedding provider — default *off* (keyword
 * only, no network) — configured as an OpenAI-compatible endpoint, so the same client reaches a
 * local runtime (Ollama/LM Studio at `http://localhost:11434/v1`) or a hosted API just by changing
 * the base URL + model. Vectors are stored in the derived SQLite index and searched by brute-force
 * cosine, fused with FTS results. This module owns provider I/O and the vector math only.
 */

/** Owner-configurable embedding settings; `off` means keyword-only, no embeddings, no network. */
export interface EmbeddingConfig {
  provider: 'off' | 'openai-compatible';
  /** OpenAI-compatible base URL, e.g. `http://localhost:11434/v1` (Ollama) or `https://api.openai.com/v1`. */
  baseUrl: string;
  /** Model name, e.g. `nomic-embed-text` (Ollama) or `text-embedding-3-small` (OpenAI). */
  model: string;
  /** Optional bearer token for hosted providers; local runtimes usually need none. */
  apiKey?: string;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'off',
  baseUrl: 'http://localhost:11434/v1',
  model: 'nomic-embed-text',
};

/** Turns text into vectors. `model` is stored with the vectors so a model change triggers re-embed. */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Largest batch of chunks sent to the provider in one request. */
const EMBED_BATCH = 64;

/**
 * Build a provider from config, or null when embeddings are off/misconfigured (caller falls back to
 * keyword-only). The request/response shape is the OpenAI `/embeddings` contract, which local
 * runtimes implement too.
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider | null {
  if (config.provider !== 'openai-compatible') return null;
  if (!config.baseUrl.trim() || !config.model.trim()) return null;
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;
  return {
    model: config.model,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batch = texts.slice(i, i + EMBED_BATCH);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({ model: config.model, input: batch }),
        });
        if (!res.ok) {
          throw new Error(`embeddings request failed: ${res.status} ${res.statusText}`);
        }
        const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
        const data = json.data ?? [];
        for (const item of data) {
          if (Array.isArray(item.embedding)) out.push(item.embedding);
        }
        if (data.length !== batch.length) {
          throw new Error(
            `embeddings response count mismatch: got ${data.length}, want ${batch.length}`,
          );
        }
      }
      return out;
    },
  };
}

/** Cosine similarity of two equal-length vectors; 0 for a zero vector or a length mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Pack a vector as little-endian float32 bytes for BLOB storage. */
export function encodeVector(vec: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(vec).buffer);
}

/** Unpack float32 BLOB bytes back into a number[]. */
export function decodeVector(bytes: Uint8Array): number[] {
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  return Array.from(f32);
}

/** Rank at which an item appears in a list (0-based), or Infinity if absent. */
function rankOf(list: string[], key: string): number {
  const i = list.indexOf(key);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/** Reciprocal-rank-fusion constant — dampens the weight of lower ranks (standard k=60). */
const RRF_K = 60;

/**
 * Fuse two ranked lists of note paths into one, best-first, via Reciprocal Rank Fusion. RRF avoids
 * having to normalize bm25 against cosine — it only uses each list's *ordering*, so keyword and
 * semantic results combine without a tunable weight.
 */
export function fuseRankings(keyword: string[], semantic: string[]): string[] {
  const paths = new Set([...keyword, ...semantic]);
  const scored = [...paths].map((path) => {
    let score = 0;
    const kr = rankOf(keyword, path);
    const sr = rankOf(semantic, path);
    if (kr !== Number.POSITIVE_INFINITY) score += 1 / (RRF_K + kr);
    if (sr !== Number.POSITIVE_INFINITY) score += 1 / (RRF_K + sr);
    return { path, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.path);
}
