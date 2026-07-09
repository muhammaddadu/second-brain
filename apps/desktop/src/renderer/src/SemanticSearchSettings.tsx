/**
 * Semantic-search provider configuration (ADR 0008). Compact guided flow: toggle on → pick a
 * provider from a tight card grid (local-first) → configure only that provider → test → manage the
 * index. Provider metadata is data-driven, so adding a provider is a table entry + a config panel.
 */
import type {
  DiscoveredProvider,
  EmbeddingSettings,
  ProviderConfig,
  ProviderKind,
  TestResult,
} from '@brain/core';
import { Check, Cloud, Cpu, HardDrive, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { IndexStats } from '../../shared/ipc';

interface ProviderMeta {
  kind: ProviderKind;
  name: string;
  privacy: 'local' | 'hosted';
  difficulty: 'Easy' | 'Advanced';
  blurb: string;
  recommended?: boolean;
  Icon: typeof Cloud;
}

const GROUPS: Array<{ title: string; providers: ProviderMeta[] }> = [
  {
    title: 'On this machine · private',
    providers: [
      {
        kind: 'builtin',
        name: 'Built-in',
        privacy: 'local',
        difficulty: 'Easy',
        recommended: true,
        Icon: Sparkles,
        blurb:
          'Runs EmbeddingGemma-300M on-device — no setup. Downloads once (~200 MB), then works fully offline.',
      },
      {
        kind: 'ollama',
        name: 'Ollama',
        privacy: 'local',
        difficulty: 'Easy',
        Icon: HardDrive,
        blurb: 'Use models from a local Ollama install. Note text never leaves your machine.',
      },
      {
        kind: 'lmstudio',
        name: 'LM Studio',
        privacy: 'local',
        difficulty: 'Easy',
        Icon: Cpu,
        blurb: 'Use LM Studio’s local OpenAI-compatible server.',
      },
    ],
  },
  {
    title: 'Cloud providers',
    providers: [
      {
        kind: 'openai',
        name: 'OpenAI',
        privacy: 'hosted',
        difficulty: 'Easy',
        Icon: Cloud,
        blurb: 'Sends note text to OpenAI. Usage may incur cost.',
      },
      {
        kind: 'bedrock',
        name: 'AWS Bedrock',
        privacy: 'hosted',
        difficulty: 'Advanced',
        Icon: Cloud,
        blurb: 'Titan / Cohere embeddings via your AWS account. Sends note text to AWS.',
      },
      {
        kind: 'openai-compatible',
        name: 'Custom',
        privacy: 'hosted',
        difficulty: 'Advanced',
        Icon: Cloud,
        blurb: 'Any OpenAI-compatible /embeddings endpoint (incl. Azure / Vertex gateways).',
      },
    ],
  },
];

const META = new Map(GROUPS.flatMap((g) => g.providers).map((p) => [p.kind, p]));

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
  const [builtinReady, setBuiltinReady] = useState<boolean | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);

  const active = embedding.kind;
  const meta = META.get(active);
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

  const refreshBuiltinReady = useCallback(() => {
    window.vault
      .builtinModelReady()
      .then(setBuiltinReady)
      .catch(() => setBuiltinReady(false));
  }, []);

  useEffect(() => {
    if (!embedding.enabled) return;
    refreshStats();
    return window.vault.onIndexStatus((s) => {
      refreshStats();
      if (s.state === 'downloading') {
        setDownloadPct(s.done);
      } else {
        setDownloadPct(null);
        if (s.state === 'idle') refreshBuiltinReady(); // download may have just finished
      }
    });
  }, [embedding.enabled, refreshStats, refreshBuiltinReady]);

  useEffect(() => {
    window.vault
      .hasEmbeddingSecret(active)
      .then(setSecretSet)
      .catch(() => setSecretSet(false));
    setTest({ loading: false, result: null });
    if (active === 'builtin') refreshBuiltinReady();
    else setBuiltinReady(null);
  }, [active, refreshBuiltinReady]);

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
    setTest({ loading: false, result: await window.vault.testProvider() });
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

  return (
    <section className="mt-10">
      <h2 className="text-faint mb-2 text-xs font-medium tracking-wide uppercase">
        Semantic search
      </h2>
      <label className="border-edge flex cursor-pointer items-center justify-between border-b py-4">
        <span className="min-w-0 pr-4">
          <span className="text-ink block text-sm font-medium">Find notes by meaning</span>
          <span className="text-muted block text-xs leading-relaxed">
            Keyword search always stays on your machine. Turn on to also match by meaning, locally
            or through a provider you choose.
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
        <div className="animate-fade mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-ink text-sm font-medium">Provider</span>
            <button
              type="button"
              onClick={() => void runScan()}
              className="border-edge hover:border-accent/40 text-muted hover:text-ink flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
            >
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Scan this machine
            </button>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-faint mb-1.5 text-[11px] font-medium tracking-wide uppercase">
                {group.title}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {group.providers.map((p) => (
                  <ProviderTile
                    key={p.kind}
                    meta={p}
                    selected={active === p.kind}
                    detected={scan?.find((d) => d.kind === p.kind)}
                    onSelect={() => onChange({ ...embedding, kind: p.kind })}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Selected provider: blurb + only its fields + test */}
          <div className="border-edge flex flex-col gap-3 rounded-xl border p-4">
            {meta && (
              <p className="text-muted text-xs leading-relaxed">
                <span className="text-ink font-medium">{meta.name}.</span> {meta.blurb}
              </p>
            )}
            {active === 'builtin' ? (
              <BuiltinPanel
                ready={builtinReady}
                downloadPct={downloadPct}
                testResult={test.result}
                testing={test.loading}
                onDownload={() => void window.vault.downloadBuiltinModel()}
                onTest={() => void runTest()}
              />
            ) : (
              <>
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
                      {test.result.ok && <Check size={13} />}
                      {test.result.message}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

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

/** Built-in on-device model: first-run consent + download progress, then Test. */
function BuiltinPanel({
  ready,
  downloadPct,
  testResult,
  testing,
  onDownload,
  onTest,
}: {
  ready: boolean | null;
  downloadPct: number | null;
  testResult: TestResult | null;
  testing: boolean;
  onDownload: () => void;
  onTest: () => void;
}) {
  if (downloadPct !== null) {
    return (
      <div className="flex flex-col gap-2" data-testid="builtin-downloading">
        <span className="text-muted text-xs">Downloading EmbeddingGemma… {downloadPct}%</span>
        <div className="bg-edge h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full transition-all"
            style={{ width: `${downloadPct}%` }}
          />
        </div>
        <span className="text-faint text-[11px]">
          One-time download. Once complete it runs completely offline — your notes never leave this
          device.
        </span>
      </div>
    );
  }

  if (ready) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTest}
          className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm"
          data-testid="test-connection"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <span className="text-faint flex items-center gap-1.5 text-xs">
          <Check size={13} className="text-green-700 dark:text-green-400" /> Downloaded — runs
          offline on this device.
        </span>
        {testResult && !testResult.ok && (
          <span className="text-accent text-xs">{testResult.message}</span>
        )}
      </div>
    );
  }

  // Not downloaded yet → first-run consent.
  return (
    <div className="border-edge bg-surface/50 flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <p className="text-muted text-xs leading-relaxed">
        The first time you use it, the app downloads{' '}
        <strong className="text-ink">EmbeddingGemma-300M</strong> (about 200 MB). After that it runs{' '}
        <strong className="text-ink">completely offline</strong> on this device — your note text is
        never sent anywhere.
      </p>
      <button
        type="button"
        onClick={onDownload}
        className="bg-accent text-accent-ink self-start rounded-lg px-3 py-1.5 text-sm"
        data-testid="download-model"
      >
        Download model (~200 MB)
      </button>
    </div>
  );
}

function ProviderTile({
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
  const status = detected?.status === 'running' ? 'Detected' : detected ? 'Not running' : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
        selected ? 'border-accent/60 bg-accent/10' : 'border-edge hover:border-accent/30'
      }`}
    >
      <span className="flex w-full items-center gap-1.5">
        <meta.Icon
          size={14}
          className={selected ? 'text-accent shrink-0' : 'text-faint shrink-0'}
        />
        <span className="text-ink truncate text-sm font-medium">{meta.name}</span>
        {meta.recommended && (
          <span className="bg-accent/15 text-accent ml-auto rounded px-1 py-0.5 text-[9px] font-medium tracking-wide uppercase">
            Rec
          </span>
        )}
      </span>
      <span className="text-faint flex items-center gap-1 text-[11px]">
        {meta.privacy === 'local' ? 'Private' : 'Sends out'} · {meta.difficulty}
        {status && (
          <span
            className={detected?.status === 'running' ? 'text-green-700 dark:text-green-400' : ''}
          >
            · {status}
          </span>
        )}
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
      {label && <span className="text-muted text-xs font-medium">{label}</span>}
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
          <RefreshCw size={11} /> Refresh
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
  const secretNote = keychainOk ? null : (
    <p className="text-accent text-[11px]">
      Your OS keychain is unavailable, so keys can’t be stored securely — prefer a local provider.
    </p>
  );

  if (kind === 'builtin') {
    // Zero-config: nothing to fill in. The model downloads on first index / test.
    return (
      <p className="text-faint text-[11px]">
        Nothing to configure. Test to download and warm up the model.
      </p>
    );
  }

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
      </>
    );
  }

  if (kind === 'bedrock') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="AWS region"
            value={config.region ?? ''}
            placeholder="us-east-1"
            onCommit={(v) => onConfig({ region: v })}
          />
          <ModelField
            value={config.model ?? ''}
            models={models}
            onCommit={(v) => onConfig({ model: v })}
            onRefresh={onRefreshModels}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Access key ID (optional)"
            value=""
            placeholder={secretSet ? '•••• stored' : 'uses AWS profile if blank'}
            onCommit={(v) => v.trim() && onSaveSecret({ awsAccessKeyId: v })}
          />
          <Field
            label="Secret key (optional)"
            value=""
            type="password"
            placeholder={secretSet ? '•••• stored' : 'uses AWS profile if blank'}
            onCommit={(v) => v.trim() && onSaveSecret({ awsSecretAccessKey: v })}
          />
        </div>
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
        placeholder={secretSet ? '•••• stored (leave blank to keep)' : 'sk-…'}
        onCommit={(v) => onSaveSecret({ apiKey: v })}
      />
      {keychainOk && (
        <p className="text-faint text-[11px]">
          Keys are encrypted in your OS keychain, never in the vault.
        </p>
      )}
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
      className="border-edge flex flex-col gap-2.5 rounded-xl border p-4"
      data-testid="index-controls"
    >
      <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>
          <span className="text-ink tabular-nums">{stats.notes}</span> notes
        </span>
        <span>
          <span className="text-ink tabular-nums">
            {stats.embedded}/{stats.chunks}
          </span>{' '}
          embedded ({pct}%)
        </span>
        {stats.model && <span className="text-faint truncate">{stats.model}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRebuild}
          className="border-edge hover:bg-surface rounded-lg border px-2.5 py-1 text-xs"
        >
          Rebuild
        </button>
        <button
          type="button"
          onClick={() => onPause(!stats.paused)}
          className="border-edge hover:bg-surface rounded-lg border px-2.5 py-1 text-xs"
        >
          {stats.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="border-edge text-accent hover:bg-surface rounded-lg border px-2.5 py-1 text-xs"
        >
          Clear semantic index
        </button>
      </div>
    </div>
  );
}
