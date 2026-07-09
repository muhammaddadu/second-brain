/**
 * Embeddings (E4 semantic leg). Providers are **adapters behind one interface** (ADR 0008): the
 * index/search code depends only on {@link EmbeddingProvider}, so adding a provider is one adapter,
 * not edits across call sites. Default is *off* (keyword only, no network); local providers keep
 * note text on-device. Vectors live in the SQLite index and are searched by brute-force cosine.
 * This module owns provider I/O, discovery, and the vector math; secrets are injected (never stored
 * here — the main process resolves them from the OS keychain).
 */

/**
 * Provider kinds shipped today. `builtin` runs a small model on-device (EmbeddingGemma via
 * Transformers.js); Azure/Vertex route to `openai-compatible` until native adapters land.
 */
export type ProviderKind =
  | 'builtin'
  | 'ollama'
  | 'lmstudio'
  | 'openai'
  | 'openai-compatible'
  | 'bedrock';

/** Non-secret configuration for a single provider (secrets are passed separately at construction). */
export interface ProviderConfig {
  kind: ProviderKind;
  /** OpenAI-compatible base URL (ollama/lmstudio/openai/custom). */
  baseUrl?: string;
  /** Model name, the Bedrock model id, or the `builtin` on-device model repo. */
  model?: string;
  /** AWS region (bedrock only). */
  region?: string;
  /** Where the `builtin` provider caches its downloaded model (set by the app to userData). */
  cacheDir?: string;
}

/** Secrets an adapter may need, resolved by the main process from `safeStorage` and injected. */
export interface ProviderSecrets {
  apiKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}

/** Whole embedding configuration persisted in settings: which provider, and each provider's config. */
export interface EmbeddingSettings {
  enabled: boolean;
  kind: ProviderKind;
  /** Per-kind config, so switching providers preserves each one's fields. */
  configs: Partial<Record<ProviderKind, ProviderConfig>>;
}

/** The on-device model the `builtin` provider runs (a Transformers.js-compatible ONNX build). */
export const BUILTIN_EMBEDDING_MODEL = 'onnx-community/embeddinggemma-300m-ONNX';

export const DEFAULT_EMBEDDING_SETTINGS: EmbeddingSettings = {
  enabled: false,
  kind: 'builtin',
  configs: {
    builtin: { kind: 'builtin', model: BUILTIN_EMBEDDING_MODEL },
    ollama: { kind: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'nomic-embed-text' },
    lmstudio: { kind: 'lmstudio', baseUrl: 'http://localhost:1234/v1', model: '' },
    openai: {
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
    },
    'openai-compatible': { kind: 'openai-compatible', baseUrl: '', model: '' },
    bedrock: { kind: 'bedrock', region: 'us-east-1', model: 'amazon.titan-embed-text-v2:0' },
  },
};

/** Result of a provider connection test, in plain language for the UI. */
export interface TestResult {
  ok: boolean;
  message: string;
  dimensions?: number;
}

/** Minimal surface the index/search needs — every adapter is also a provider. */
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Full provider adapter (ADR 0008). Index/search use only the {@link EmbeddingProvider} subset. */
export interface EmbeddingAdapter extends EmbeddingProvider {
  readonly kind: ProviderKind;
  /** 'local' = note text stays on this machine; 'hosted' = text is sent to the provider. */
  privacyMode(): 'local' | 'hosted';
  /** Largest number of inputs per request. */
  maxBatch(): number;
  /** Known embedding dimension after a successful test, else null. */
  dimensions(): number | null;
  /** Models this provider offers (empty if it can't enumerate). */
  listModels(): Promise<string[]>;
  /** Probe connectivity + that the model returns embeddings; plain-language message. */
  testConnection(): Promise<TestResult>;
}

const OPENAI_BATCH = 64;

function bearer(apiKey?: string): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

/**
 * Adapter for any provider speaking the OpenAI `/embeddings` contract — Ollama, LM Studio, OpenAI,
 * and custom endpoints all differ only in base URL, whether a key is needed, and privacy.
 */
function openAiFamilyAdapter(
  kind: ProviderKind,
  privacy: 'local' | 'hosted',
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
): EmbeddingAdapter {
  const root = baseUrl.replace(/\/+$/, '');
  let dims: number | null = null;

  async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += OPENAI_BATCH) {
      const batch = texts.slice(i, i + OPENAI_BATCH);
      const res = await fetch(`${root}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(apiKey) },
        body: JSON.stringify({ model, input: batch }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
      const data = json.data ?? [];
      if (data.length !== batch.length) {
        throw new Error(`expected ${batch.length} embeddings, got ${data.length}`);
      }
      for (const item of data) {
        if (!Array.isArray(item.embedding)) throw new Error('response was not an embedding');
        out.push(item.embedding);
        dims = item.embedding.length;
      }
    }
    return out;
  }

  return {
    kind,
    model,
    privacyMode: () => privacy,
    maxBatch: () => OPENAI_BATCH,
    dimensions: () => dims,
    async listModels(): Promise<string[]> {
      try {
        const res = await fetch(`${root}/models`, { headers: bearer(apiKey) });
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        return (json.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string');
      } catch {
        return [];
      }
    },
    async testConnection(): Promise<TestResult> {
      if (!model) return { ok: false, message: 'Choose an embedding model first.' };
      try {
        const [vec] = await embed(['connection test']);
        if (!vec || vec.length === 0) {
          return { ok: false, message: 'The endpoint responded, but not with an embedding.' };
        }
        return {
          ok: true,
          message: `Connected — ${vec.length}-dimension embeddings.`,
          dimensions: vec.length,
        };
      } catch (error) {
        return { ok: false, message: explainError(error, privacy) };
      }
    },
    embed,
  };
}

/** Turn a raw error into plain-language guidance for the UI. */
function explainError(error: unknown, privacy: 'local' | 'hosted'): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|Failed to fetch|network/i.test(msg)) {
    return privacy === 'local'
      ? 'Could not reach the local runtime. Is it installed and running?'
      : 'Could not reach the provider. Check the endpoint URL and your connection.';
  }
  if (/\b401\b|unauthorized|invalid.*key/i.test(msg)) return 'The provider rejected the API key.';
  if (/\b501\b|not implemented/i.test(msg)) {
    return 'This endpoint does not implement embeddings — choose an embedding model, not a chat model.';
  }
  if (/\b404\b|not found|model/i.test(msg)) return 'That model was not found on the provider.';
  if (/not an embedding/i.test(msg)) return 'This model does not appear to support embeddings.';
  return `Connection failed: ${msg}`;
}

/**
 * Build the adapter for a provider config + injected secrets, or null when embeddings are off /
 * the config is incomplete (caller falls back to keyword-only). Bedrock is loaded lazily so its
 * AWS SDK never loads for the common local path.
 */
export async function createEmbeddingAdapter(
  config: ProviderConfig,
  secrets: ProviderSecrets = {},
): Promise<EmbeddingAdapter | null> {
  switch (config.kind) {
    case 'builtin': {
      const { createLocalAdapter } = await import('./embeddings-local.js');
      return createLocalAdapter(config.model || BUILTIN_EMBEDDING_MODEL, config.cacheDir);
    }
    case 'ollama':
      if (!config.baseUrl || !config.model) return null;
      return openAiFamilyAdapter('ollama', 'local', config.baseUrl, config.model, undefined);
    case 'lmstudio':
      if (!config.baseUrl || !config.model) return null;
      return openAiFamilyAdapter('lmstudio', 'local', config.baseUrl, config.model, undefined);
    case 'openai':
      if (!config.baseUrl || !config.model) return null;
      return openAiFamilyAdapter('openai', 'hosted', config.baseUrl, config.model, secrets.apiKey);
    case 'openai-compatible':
      if (!config.baseUrl || !config.model) return null;
      return openAiFamilyAdapter(
        'openai-compatible',
        'hosted',
        config.baseUrl,
        config.model,
        secrets.apiKey,
      );
    case 'bedrock': {
      if (!config.region || !config.model) return null;
      const { createBedrockAdapter } = await import('./embeddings-bedrock.js');
      return createBedrockAdapter(config.region, config.model, secrets);
    }
    default:
      return null;
  }
}

/** Detection state for a local runtime the app scanned for. */
export interface DiscoveredProvider {
  kind: ProviderKind;
  status: 'running' | 'needs-setup' | 'connection-failed';
  baseUrl: string;
  models: string[];
}

const LOCAL_PROBES: Array<{ kind: ProviderKind; baseUrl: string }> = [
  { kind: 'ollama', baseUrl: 'http://localhost:11434/v1' },
  { kind: 'lmstudio', baseUrl: 'http://localhost:1234/v1' },
];

/** Probe well-known local runtimes so setup is a click, not a manual URL (ADR 0008 self-discovery). */
export async function scanLocalProviders(): Promise<DiscoveredProvider[]> {
  return Promise.all(
    LOCAL_PROBES.map(async ({ kind, baseUrl }) => {
      // Probe directly (not via listModels, which swallows errors) so we can tell running from down.
      try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`);
        if (!res.ok) return { kind, status: 'needs-setup' as const, baseUrl, models: [] };
        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        const models = (json.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string');
        return { kind, status: 'running' as const, baseUrl, models };
      } catch {
        return { kind, status: 'connection-failed' as const, baseUrl, models: [] };
      }
    }),
  );
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
