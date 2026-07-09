/**
 * User preferences as a dedicated page in the main content area (the sidebar stays in place) —
 * the seam for more settings over time. Today: appearance theme and window translucency, applied
 * live via the main process and persisted in the app config.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/ipc';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  // Local mirror of the embedding text fields so typing doesn't round-trip on every keystroke; we
  // commit on blur / toggle. Initialized once from the loaded settings.
  const [embed, setEmbed] = useState({ baseUrl: '', model: '', apiKey: '' });

  useEffect(() => {
    window.vault
      .getSettings()
      .then((s) => {
        setSettings(s);
        setEmbed({
          baseUrl: s.embedding.baseUrl,
          model: s.embedding.model,
          apiKey: s.embedding.apiKey ?? '',
        });
      })
      .catch(console.error);
  }, []);

  async function update(patch: Partial<Settings>) {
    try {
      setSettings(await window.vault.setSettings(patch));
    } catch (error) {
      console.error(error);
    }
  }

  const semanticOn = settings?.embedding.provider === 'openai-compatible';

  function commitEmbedding(enabled: boolean) {
    void update({
      embedding: {
        provider: enabled ? 'openai-compatible' : 'off',
        baseUrl: embed.baseUrl.trim(),
        model: embed.model.trim(),
        ...(embed.apiKey.trim() ? { apiKey: embed.apiKey.trim() } : {}),
      },
    });
  }

  return (
    <div className="animate-fade mx-auto max-w-2xl px-10 py-8" data-testid="settings-page">
      <h1 className="font-serif text-3xl font-semibold">Settings</h1>

      {settings && (
        <section className="mt-8">
          <h2 className="text-faint mb-3 text-xs font-medium tracking-wide uppercase">
            Appearance
          </h2>

          <div className="border-edge flex items-center justify-between border-b py-4">
            <div className="min-w-0">
              <div className="text-ink text-sm font-medium">Theme</div>
              <div className="text-muted text-xs">Follow the system, or force light or dark.</div>
            </div>
            <div className="border-edge bg-surface flex gap-1 rounded-lg border p-1">
              {THEME_OPTIONS.map(({ value, label, Icon }) => {
                const active = settings.theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void update({ theme: value })}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${
                      active ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Icon size={14} strokeWidth={1.75} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between py-4">
            <span className="min-w-0">
              <span className="text-ink block text-sm font-medium">Reduce transparency</span>
              <span className="text-muted block text-xs">
                Turn off the translucent window effect.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.reduceTransparency}
              onChange={(e) => void update({ reduceTransparency: e.target.checked })}
              className="accent-accent h-4 w-4 shrink-0"
            />
          </label>
        </section>
      )}

      {settings && (
        <section className="mt-10">
          <h2 className="text-faint mb-3 text-xs font-medium tracking-wide uppercase">
            Search &amp; indexing
          </h2>

          <label className="flex cursor-pointer items-center justify-between border-edge border-b py-4">
            <span className="min-w-0 pr-4">
              <span className="text-ink block text-sm font-medium">Semantic search</span>
              <span className="text-muted block text-xs leading-relaxed">
                Find notes by meaning, not just keywords. Off by default — keyword search always
                works and stays fully on your machine. Turn on to embed notes with a provider below.
              </span>
            </span>
            <input
              type="checkbox"
              checked={semanticOn}
              onChange={(e) => commitEmbedding(e.target.checked)}
              className="accent-accent h-4 w-4 shrink-0"
              data-testid="semantic-toggle"
            />
          </label>

          {semanticOn && (
            <div className="animate-fade flex flex-col gap-4 py-4">
              <p className="text-muted text-xs leading-relaxed">
                Uses any OpenAI-compatible embeddings endpoint. A <strong>local</strong> runtime
                (e.g. Ollama at <code className="text-ink">http://localhost:11434/v1</code>) keeps
                everything on your machine; a hosted URL sends note text to that provider.
              </p>
              <Field
                label="Endpoint (base URL)"
                value={embed.baseUrl}
                placeholder="http://localhost:11434/v1"
                onChange={(v) => setEmbed((s) => ({ ...s, baseUrl: v }))}
                onCommit={() => commitEmbedding(true)}
              />
              <Field
                label="Model"
                value={embed.model}
                placeholder="nomic-embed-text"
                onChange={(v) => setEmbed((s) => ({ ...s, model: v }))}
                onCommit={() => commitEmbedding(true)}
              />
              <Field
                label="API key (optional)"
                value={embed.apiKey}
                placeholder="only for hosted providers"
                type="password"
                onChange={(v) => setEmbed((s) => ({ ...s, apiKey: v }))}
                onCommit={() => commitEmbedding(true)}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password';
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-xs font-medium">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="border-edge bg-raised text-ink placeholder:text-faint focus:border-accent/50 rounded-lg border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}
