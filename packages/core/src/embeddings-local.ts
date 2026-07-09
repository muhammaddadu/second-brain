/**
 * Built-in on-device embedding adapter (ADR 0008). Runs a small model — EmbeddingGemma-300M by
 * default — locally via Transformers.js (ONNX), so note text never leaves the machine and there's
 * no runtime to install. Kept in its own module and imported lazily by the factory, so the (heavy)
 * Transformers.js + ONNX runtime only loads when the built-in provider is actually used. The model
 * downloads once to the app's cache directory, then runs fully offline.
 */
import type { EmbeddingAdapter, TestResult } from './embeddings.js';

/** The slice of Transformers.js we use, typed locally to avoid depending on its full type surface. */
type FeatureExtractor = (
  text: string,
  opts: { pooling: 'mean' | 'cls' | 'none'; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;
interface TransformersModule {
  env: { cacheDir?: string; allowLocalModels?: boolean };
  pipeline(task: 'feature-extraction', model: string): Promise<FeatureExtractor>;
}

/** Chunks embedded per call — small, since inference is CPU-bound and serialized on-device. */
const LOCAL_BATCH = 16;

export function createLocalAdapter(model: string, cacheDir?: string): EmbeddingAdapter {
  let dims: number | null = null;
  let extractorPromise: Promise<FeatureExtractor> | null = null;

  // Load Transformers.js + the model on first use; cache the pipeline for the adapter's lifetime.
  function getExtractor(): Promise<FeatureExtractor> {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        const tf = (await import('@huggingface/transformers')) as unknown as TransformersModule;
        if (cacheDir) tf.env.cacheDir = cacheDir;
        return tf.pipeline('feature-extraction', model);
      })();
    }
    return extractorPromise;
  }

  async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await getExtractor();
    const out: number[][] = [];
    for (const text of texts) {
      const result = await extractor(text, { pooling: 'mean', normalize: true });
      const vec = Array.from(result.data);
      dims = vec.length;
      out.push(vec);
    }
    return out;
  }

  return {
    kind: 'builtin',
    model,
    privacyMode: () => 'local',
    maxBatch: () => LOCAL_BATCH,
    dimensions: () => dims,
    async listModels(): Promise<string[]> {
      return [model];
    },
    async testConnection(): Promise<TestResult> {
      try {
        const [vec] = await embed(['connection test']);
        if (!vec || vec.length === 0) {
          return { ok: false, message: 'The on-device model loaded but returned no embedding.' };
        }
        return {
          ok: true,
          message: `Ready — ${vec.length}-dimension embeddings, fully on-device.`,
          dimensions: vec.length,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, message: `Could not load the on-device model: ${msg}` };
      }
    },
    embed,
  };
}
