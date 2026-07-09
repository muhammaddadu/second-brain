/**
 * Semantic-search provider configuration (ADR 0008). A guided flow: toggle on → pick a provider from
 * grouped cards (local-first) → fill only that provider's fields → test → manage the index. Provider
 * metadata is data-driven so adding a provider is a table entry + a config panel, not new flow code.
 */
import type {
  DiscoveredProvider,
  EmbeddingSettings,
  ProviderConfig,
  ProviderKind,
  TestResult,
} from '@brain/core';
import {
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { IndexStats } from '../../shared/ipc';

interface ProviderMeta {
  kind: ProviderKind;
  name: string;
  privacy: 'local' | 'hosted';
  difficulty: 'Easy' | 'Moderate' | 'Advanced';
  blurb: string;
  recommended?: boolean;
}

const GROUPS: Array<{ title: string; providers: ProviderMeta[] }> = [
  {
    title: 'Recommended — local on this machine',
    providers: [
      {
        kind: 'ollama',
        name: 'Ollama',
        privacy: 'local',
        difficulty: 'Easy',
        blurb: 'Runs models locally. Note text never leaves your machine.',
        recommended: true,
      },
      {
        kind: 'lmstudio',
        name: 'LM Studio',
        privacy: 'local',
        difficulty: 'Easy',
        blurb: 'Local model runtime with an OpenAI-compatible server.',
      },
    ],
  },
  {
    title: 'Hosted providers',
    providers: [
      {
        kind: 'openai',
        name: 'OpenAI',
        privacy: 'hosted',
        difficulty: 'Easy',
        blurb: 'Sends note text to OpenAI. Usage may incur cost.',
      },
    ],
  },
  {
    title: 'Enterprise cloud',
    providers: [
      {
        kind: 'bedrock',
        name: 'AWS Bedrock',
        privacy: 'hosted',
        difficulty: 'Advanced',
        blurb: 'Titan / Cohere embeddings via your AWS account.',
      },
    ],
  },
  {
    title: 'Advanced',
    providers: [
      {
        kind: 'openai-compatible',
        name: 'Custom endpoint',
        privacy: 'hosted',
        difficulty: 'Advanced',
        blurb: 'Any OpenAI-compatible /embeddings endpoint (incl. Azure/Vertex gateways).',
      },
    ],
  },
];

export function SemanticSearchSettings({
  embedding,
  onChange,
}: {
  embedding: EmbeddingSettings;
  onChange: (next: EmbeddingSettings) => void;
}) {
  const [scan, setScan] = useState<DiscoveredProvider[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [test, setTest] = useState<{ loading: boolean; result: TestResult | null }>({
    loading: false,
    result: null,
  });
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [secretSet, setSecretSet] = useState(false);
  const [keychainOk, setKeychainOk] = useState(true);

  const active = embedding.kind;
  const config: ProviderConfig = embedding.configs[active] ?? { kind: active };

  const refreshStats = useCallback(() => {
    window.vault.indexStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    window.vault
      .secretStorageAvailable()
      .then(setKeychainOk)
      .catch(() => setKeychainOk(false));
  }, []);

  // Keep stats live while the panel is open (indexing runs in the background).
  useEffect(() => {
    if (!embedding.enabled) return;
    refreshStats();
    const unsub = window.vault.onIndexStatus(() => refreshStats());
    return unsub;
  }, [embedding.enabled, refreshStats]);

  // Reflect whether the selected provider has a stored secret.
  useEffect(() => {
    window.vault
      .hasEmbeddingSecret(active)
      .then(setSecretSet)
      .catch(() => setSecretSet(false));
    setTest({ loading: false, result: null });
  }, [active]);

  function setConfig(patch: Partial<ProviderConfig>) {
    onChange({
      ...embedding,
      configs: { ...embedding.configs, [active]: { ...config, kind: active, ...patch } },
    });
  }

  async function runScan() {
    setScanning(true);
    try {
      const found = await window.vault.scanProviders();
      setScan(found);
      // Auto-fill models for detected local providers.
      const next: Record<string, string[]> = {};
      for (const p of found) if (p.models.length) next[p.kind] = p.models;
      setModels((m) => ({ ...m, ...next }));
    } finally {
      setScanning(false);
    }
  }

  async function refreshModels() {
    const list = await window.vault.listModels(active);
    setModels((m) => ({ ...m, [active]: list }));
  }

  async function runTest() {
    setTest({ loading: true, result: null });
    const result = await window.vault.testProvider();
    setTest({ loading: false, result });
    refreshStats();
  }

  async function saveSecret(fields: {
    apiKey?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
  }) {
    await window.vault.setEmbeddingSecret(active, fields);
    setSecretSet(Object.values(fields).some((v) => v?.trim()));
  }

  const detected = (kind: ProviderKind) => scan?.find((p) => p.kind === kind);

  return (
    <section className="mt-10">
      <h2 className="text-faint mb-2 text-xs font-medium tracking-wide uppercase">
        Semantic search
      </h2>
      <p className="text-muted mb-4 max-w-prose text-sm leading-relaxed">
        Find notes by meaning, not just exact words. Keyword search always stays on your machine.
        Semantic search can run locally or through a provider you choose.
      </p>

      <label className="border-edge flex cursor-pointer items-center justify-between border-b py-4">
        <span className="min-w-0 pr-4">
          <span className="text-ink block text-sm font-medium">Enable semantic search</span>
          <span className="text-muted block text-xs">
            Off keeps everything keyword-only and fully local.
          </span>
        </span>
        <input
          type="checkbox"
          checked={embedding.enabled}
          onChange={(e) => onChange({ ...embedding, enabled: e.target.checked })}
          className="accent-accent h-4 w-4 shrink-0"
          data-testid="semantic-toggle"
        />
      </label>

      {embedding.enabled && (
        <div className="animate-fade mt-5 flex flex-col gap-6">
          {/* Step: choose provider */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-ink text-sm font-medium">Embedding provider</h3>
              <button
                type="button"
                onClick={() => void runScan()}
                className="border-edge hover:border-accent/40 text-muted hover:text-ink flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
              >
                {scanning ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                Scan this machine
              </button>
            </div>
            <p className="text-muted mb-3 text-xs">
              Choose where embeddings are created. We recommend a local provider for the most
              private setup.
            </p>
            {GROUPS.map((group) => (
              <div key={group.title} className="mb-4">
                <div className="text-faint mb-2 text-[11px] font-medium tracking-wide uppercase">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.providers.map((meta) => (
                    <ProviderCard
                      key={meta.kind}
                      meta={meta}
                      selected={active === meta.kind}
                      detected={detected(meta.kind)}
                      onSelect={() => onChange({ ...embedding, kind: meta.kind })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Step: configure the selected provider */}
          <div className="border-edge flex flex-col gap-4 rounded-xl border p-4">
            <ProviderConfigPanel
              kind={active}
              config={config}
              models={models[active] ?? []}
              secretSet={secretSet}
              keychainOk={keychainOk}
              onConfig={setConfig}
              onRefreshModels={() => void refreshModels()}
              onSaveSecret={saveSecret}
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void runTest()}
                className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm"
                data-testid="test-connection"
              >
                {test.loading ? 'Testing…' : 'Test connection'}
              </button>
              {test.result && (
                <span
                  className={`flex items-center gap-1.5 text-xs ${test.result.ok ? 'text-green-700 dark:text-green-400' : 'text-accent'}`}
                >
                  {test.result.ok && <CheckCircle2 size={14} />}
                  {test.result.message}
                </span>
              )}
            </div>
          </div>

          {/* Step: index status + controls */}
          <IndexControls
            stats={stats}
            onRebuild={async () => {
              await window.vault.rebuildIndex();
              refreshStats();
            }}
            onClear={async () => {
              await window.vault.clearSemanticIndex();
              refreshStats();
            }}
            onPause={async (p) => {
              await window.vault.pauseIndexing(p);
              refreshStats();
            }}
          />
        </div>
      )}
    </section>
  );
}

function ProviderCard({
  meta,
  selected,
  detected,
  onSelect,
}: {
  meta: ProviderMeta;
  selected: boolean;
  detected?: DiscoveredProvider;
  onSelect: () => void;
}) {
  const status =
    detected?.status === 'running'
      ? { label: 'Detected', tone: 'text-green-700 dark:text-green-400' }
      : detected
        ? { label: 'Not running', tone: 'text-muted' }
        : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left ${
        selected ? 'border-accent/60 bg-accent/10' : 'border-edge hover:border-accent/30'
      }`}
    >
      <span className="flex w-full items-center gap-1.5">
        {meta.privacy === 'local' ? (
          <HardDrive size={14} className="text-faint shrink-0" />
        ) : (
          <Cloud size={14} className="text-faint shrink-0" />
        )}
        <span className="text-ink truncate text-sm font-medium">{meta.name}</span>
        {meta.recommended && (
          <span className="bg-accent/15 text-accent ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
            Recommended
          </span>
        )}
      </span>
      <span className="text-muted text-xs leading-snug">{meta.blurb}</span>
      <span className="text-faint mt-1 flex items-center gap-2 text-[11px]">
        <span className="flex items-center gap-1">
          {meta.privacy === 'local' ? <ShieldCheck size={11} /> : null}
          {meta.privacy === 'local' ? 'Private' : 'Sends text out'}
        </span>
        <span>· {meta.difficulty}</span>
        {status && <span className={`· ${status.tone}`}>· {status.label}</span>}
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  placeholder,
  type = 'text',
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password';
  onCommit: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-xs font-medium">{label}</span>
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="border-edge bg-raised text-ink placeholder:text-faint focus:border-accent/50 rounded-lg border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

function ModelField({
  value,
  models,
  onCommit,
  onRefresh,
}: {
  value: string;
  models: string[];
  onCommit: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted flex items-center justify-between text-xs font-medium">
        Model
        <button
          type="button"
          onClick={onRefresh}
          className="text-faint hover:text-ink flex items-center gap-1"
        >
          <RefreshCw size={11} /> Refresh models
        </button>
      </span>
      {models.length > 0 ? (
        <select
          value={value}
          onChange={(e) => onCommit(e.target.value)}
          className="border-edge bg-raised text-ink focus:border-accent/50 rounded-lg border px-3 py-2 text-sm outline-none"
        >
          <option value="">Select a model…</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <Field label="" value={value} placeholder="model name" onCommit={onCommit} />
      )}
    </div>
  );
}

function ProviderConfigPanel({
  kind,
  config,
  models,
  secretSet,
  keychainOk,
  onConfig,
  onRefreshModels,
  onSaveSecret,
}: {
  kind: ProviderKind;
  config: ProviderConfig;
  models: string[];
  secretSet: boolean;
  keychainOk: boolean;
  onConfig: (patch: Partial<ProviderConfig>) => void;
  onRefreshModels: () => void;
  onSaveSecret: (fields: {
    apiKey?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
  }) => void;
}) {
  const keyHelp = secretSet ? 'A key is stored (leave blank to keep it).' : undefined;
  const secretNote = keychainOk ? (
    <p className="text-faint text-[11px]">
      Keys are encrypted in your OS keychain, never in the vault.
    </p>
  ) : (
    <p className="text-accent text-[11px]">
      Your OS keychain is unavailable, so keys can't be stored securely. Use a local provider.
    </p>
  );

  if (kind === 'ollama' || kind === 'lmstudio') {
    return (
      <>
        <Field
          label="Endpoint (base URL)"
          value={config.baseUrl ?? ''}
          placeholder={kind === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1'}
          onCommit={(v) => onConfig({ baseUrl: v })}
        />
        <ModelField
          value={config.model ?? ''}
          models={models}
          onCommit={(v) => onConfig({ model: v })}
          onRefresh={onRefreshModels}
        />
        <p className="text-faint text-[11px]">
          Recommended model: <code className="text-muted">nomic-embed-text</code>. Everything stays
          on this machine.
        </p>
      </>
    );
  }

  if (kind === 'bedrock') {
    return (
      <>
        <Field
          label="AWS region"
          value={config.region ?? ''}
          placeholder="us-east-1"
          onCommit={(v) => onConfig({ region: v })}
        />
        <ModelField
          value={config.model ?? ''}
          models={models.length ? models : []}
          onCommit={(v) => onConfig({ model: v })}
          onRefresh={onRefreshModels}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Access key ID (optional)"
            value=""
            placeholder={secretSet ? '•••• stored' : 'uses AWS profile if blank'}
            onCommit={(v) => v.trim() && onSaveSecret({ awsAccessKeyId: v })}
          />
          <Field
            label="Secret access key (optional)"
            value=""
            type="password"
            placeholder={secretSet ? '•••• stored' : 'uses AWS profile if blank'}
            onCommit={(v) => v.trim() && onSaveSecret({ awsSecretAccessKey: v })}
          />
        </div>
        <p className="text-faint text-[11px]">
          Leave credentials blank to use your AWS profile / environment. Note text is sent to AWS;
          usage may incur cost.
        </p>
        {secretNote}
      </>
    );
  }

  // openai / openai-compatible
  return (
    <>
      <Field
        label="Endpoint (base URL)"
        value={config.baseUrl ?? ''}
        placeholder="https://api.openai.com/v1"
        onCommit={(v) => onConfig({ baseUrl: v })}
      />
      <ModelField
        value={config.model ?? ''}
        models={models}
        onCommit={(v) => onConfig({ model: v })}
        onRefresh={onRefreshModels}
      />
      <Field
        label={`API key${kind === 'openai-compatible' ? ' (optional)' : ''}`}
        value=""
        type="password"
        placeholder={keyHelp ?? 'sk-…'}
        onCommit={(v) => onSaveSecret({ apiKey: v })}
      />
      <p className="text-faint text-[11px]">
        Note text is sent to this provider; usage may incur cost.
      </p>
      {secretNote}
    </>
  );
}

function IndexControls({
  stats,
  onRebuild,
  onClear,
  onPause,
}: {
  stats: IndexStats | null;
  onRebuild: () => void;
  onClear: () => void;
  onPause: (paused: boolean) => void;
}) {
  if (!stats) return null;
  const pct = stats.chunks > 0 ? Math.round((stats.embedded / stats.chunks) * 100) : 0;
  return (
    <div
      className="border-edge flex flex-col gap-3 rounded-xl border p-4"
      data-testid="index-controls"
    >
      <div className="flex items-center gap-2">
        <ServerCog size={15} className="text-faint" />
        <h3 className="text-ink text-sm font-medium">Semantic index</h3>
      </div>
      <div className="text-muted grid grid-cols-2 gap-y-1 text-xs">
        <span>Notes indexed</span>
        <span className="text-ink text-right tabular-nums">{stats.notes}</span>
        <span>Embeddings</span>
        <span className="text-ink text-right tabular-nums">
          {stats.embedded}/{stats.chunks} ({pct}%)
        </span>
        <span>Model</span>
        <span className="text-ink truncate text-right">{stats.model ?? '—'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRebuild}
          className="border-edge hover:bg-surface rounded-lg border px-2.5 py-1 text-xs"
        >
          Rebuild index
        </button>
        <button
          type="button"
          onClick={() => onPause(!stats.paused)}
          className="border-edge hover:bg-surface rounded-lg border px-2.5 py-1 text-xs"
        >
          {stats.paused ? 'Resume indexing' : 'Pause indexing'}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="border-edge text-accent hover:bg-surface rounded-lg border px-2.5 py-1 text-xs"
        >
          Clear semantic index
        </button>
      </div>
      <p className="text-faint text-[11px]">
        Changing the model requires rebuilding embeddings. Keyword search is unaffected and always
        available.
      </p>
    </div>
  );
}
