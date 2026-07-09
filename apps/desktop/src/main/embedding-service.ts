/**
 * Embedding / semantic-search service for the main process (ADR 0008). Owns the active embedding
 * adapter, the indexing (embed) pass, and the provider operations the Settings screen drives —
 * discovery, model listing, connection testing, rebuild, clear, stats, and pause. Kept separate from
 * `index.ts` (the app/vault shell) so this cohesive concern lives in one place; the bits it doesn't
 * own — the current index, settings, secret decryption, and status broadcast — are injected.
 */
import {
  createEmbeddingAdapter,
  type DiscoveredProvider,
  type EmbeddingAdapter,
  embedPending,
  hybridSearch,
  type ProviderConfig,
  type ProviderKind,
  rebuildIndex,
  type SearchHit,
  type SearchIndex,
  scanLocalProviders,
  syncIndex,
  type TestResult,
  type Vault,
} from '@brain/core';
import type { IndexStats, IndexStatus, ProviderSecretInput, Settings } from '../shared/ipc.js';

/** What the service needs from the surrounding app shell (things `index.ts` owns). */
export interface EmbeddingServiceDeps {
  /** The current vault's open index, or null when no vault is active. */
  getIndex(): SearchIndex | null;
  /** Current user settings (for the embedding config). */
  getSettings(): Settings;
  /** Decrypt the stored secret for a provider kind (or `{}`). */
  readSecret(kind: ProviderKind): ProviderSecretInput;
  /** Broadcast indexing status to the renderer. */
  pushStatus(status: IndexStatus): void;
  /** Directory where the built-in on-device model is cached (app userData). */
  builtinCacheDir: string;
}

export interface EmbeddingService {
  /** The active adapter (for search), or null when semantic search is off / misconfigured. */
  provider(): EmbeddingAdapter | null;
  /** Rebuild the active adapter from settings + secrets (call on startup / settings change). */
  refresh(): Promise<void>;
  /** Sync the keyword index for a vault, then run the embedding pass. */
  syncAndEmbed(vault: Vault, index: SearchIndex): Promise<void>;
  /** Run just the embedding pass over any pending chunks (no-op if off/busy). */
  runPass(): Promise<void>;
  /** Hybrid (keyword + semantic) search over the given index. */
  search(index: SearchIndex, query: string, limit?: number): Promise<SearchHit[]>;
  /** Probe local runtimes for the provider picker. */
  scan(): Promise<DiscoveredProvider[]>;
  /** Models a provider offers (uses its saved config + secret); [] if it can't enumerate. */
  listModels(kind: ProviderKind): Promise<string[]>;
  /** Test the currently-configured provider end-to-end. */
  test(): Promise<TestResult>;
  /** Rebuild the whole index from files (keyword + re-embed). */
  rebuild(vault: Vault): Promise<void>;
  /** Drop all vectors (keeps keyword search). */
  clearSemantic(): void;
  /** Counts + model + paused, for the settings screen. */
  stats(): IndexStats;
  /** Pause/resume the embedding pass; resuming kicks it off again. */
  setPaused(paused: boolean): void;
}

export function createEmbeddingService(deps: EmbeddingServiceDeps): EmbeddingService {
  // Active adapter (null = keyword-only). `running` guards against overlapping passes — a running
  // pass re-queries pending chunks, so it naturally absorbs work queued while it runs.
  let adapter: EmbeddingAdapter | null = null;
  let running = false;
  let paused = false;

  /**
   * The config for a provider kind, falling back to an empty config so callers can probe any kind.
   * Injects the runtime cache dir for the built-in on-device model (not persisted in settings).
   */
  function configFor(kind: ProviderKind): ProviderConfig {
    const config = deps.getSettings().embedding.configs[kind] ?? { kind };
    return kind === 'builtin' ? { ...config, cacheDir: deps.builtinCacheDir } : config;
  }

  async function runPass(): Promise<void> {
    const index = deps.getIndex();
    if (running || paused || !adapter || !index) return;
    running = true;
    try {
      await embedPending(
        index,
        adapter,
        (p) => {
          if (p.total > 0 && p.done < p.total) {
            deps.pushStatus({ state: 'indexing', done: p.done, total: p.total });
          }
        },
        () => !paused,
      );
    } catch (error) {
      console.error('embedding pass failed', error);
    } finally {
      running = false;
      deps.pushStatus({ state: 'idle', done: 0, total: 0 });
    }
  }

  return {
    provider: () => adapter,

    async refresh(): Promise<void> {
      const { embedding } = deps.getSettings();
      adapter = embedding.enabled
        ? await createEmbeddingAdapter(configFor(embedding.kind), deps.readSecret(embedding.kind))
        : null;
    },

    async syncAndEmbed(vault: Vault, index: SearchIndex): Promise<void> {
      await syncIndex(vault, index); // keyword index (fast, local)
      await runPass(); // semantic embeddings (slow, network) if a provider is set
    },

    runPass,

    search(index: SearchIndex, query: string, limit?: number): Promise<SearchHit[]> {
      return hybridSearch(index, query, adapter, limit);
    },

    scan: () => scanLocalProviders(),

    async listModels(kind: ProviderKind): Promise<string[]> {
      const probe = await createEmbeddingAdapter(
        { ...configFor(kind), model: configFor(kind).model || 'probe' },
        deps.readSecret(kind),
      );
      return probe ? probe.listModels() : [];
    },

    async test(): Promise<TestResult> {
      const { embedding } = deps.getSettings();
      const built = await createEmbeddingAdapter(
        configFor(embedding.kind),
        deps.readSecret(embedding.kind),
      );
      if (!built) return { ok: false, message: 'Fill in the provider settings first.' };
      return built.testConnection();
    },

    async rebuild(vault: Vault): Promise<void> {
      const index = deps.getIndex();
      if (!index) return;
      await rebuildIndex(vault, index); // keyword, from files
      await runPass(); // re-embed
    },

    clearSemantic(): void {
      deps.getIndex()?.clearEmbeddings();
    },

    stats(): IndexStats {
      const index = deps.getIndex();
      const counts = index?.stats() ?? { notes: 0, chunks: 0, embedded: 0 };
      return { ...counts, model: adapter?.model ?? null, paused };
    },

    setPaused(next: boolean): void {
      paused = next;
      if (!paused) void runPass(); // resuming picks up where it left off
    },
  };
}
