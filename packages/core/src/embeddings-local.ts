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
interface ProgressInfo {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}
interface TransformersModule {
  env: { cacheDir?: string; allowLocalModels?: boolean };
  pipeline(
    task: 'feature-extraction',
    model: string,
    options?: { progress_callback?: (info: ProgressInfo) => void },
  ): Promise<FeatureExtractor>;
}

/** Chunks embedded per call — small, since inference is CPU-bound and serialized on-device. */
const LOCAL_BATCH = 16;

/** Reports the one-time model download as a 0–100 percentage. */
export type DownloadProgress = (percent: number) => void;

export function createLocalAdapter(
  model: string,
  cacheDir?: string,
  onProgress?: DownloadProgress,
): EmbeddingAdapter {
  let dims: number | null = null;
  let extractorPromise: Promise<FeatureExtractor> | null = null;

  // Aggregate per-file download progress into one overall percentage.
  function progressCallback(): (info: ProgressInfo) => void {
    const files = new Map<string, { loaded: number; total: number }>();
    return (info) => {
      if (info.status !== 'progress' || !info.file || typeof info.total !== 'number') return;
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      if (total > 0) onProgress?.(Math.min(100, Math.round((loaded / total) * 100)));
    };
  }

  // Load Transformers.js + the model on first use; cache the pipeline for the adapter's lifetime.
  function getExtractor(): Promise<FeatureExtractor> {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        const tf = (await import('@huggingface/transformers')) as unknown as TransformersModule;
        if (cacheDir) tf.env.cacheDir = cacheDir;
        return tf.pipeline(
          'feature-extraction',
          model,
          onProgress ? { progress_callback: progressCallback() } : {},
        );
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
