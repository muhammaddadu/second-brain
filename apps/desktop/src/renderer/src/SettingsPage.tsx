/**
 * User preferences as a dedicated page in the main content area (the sidebar stays in place) — the
 * seam for more settings over time. Appearance lives here inline; the semantic-search / embedding
 * provider configuration is its own component ({@link SemanticSearchSettings}).
 */
import type { EmbeddingSettings } from '@brain/core';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/ipc';
import { SemanticSearchSettings } from './SemanticSearchSettings';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    window.vault.getSettings().then(setSettings).catch(console.error);
  }, []);

  async function update(patch: Partial<Settings>) {
    try {
      setSettings(await window.vault.setSettings(patch));
    } catch (error) {
      console.error(error);
    }
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
        <SemanticSearchSettings
          embedding={settings.embedding}
          onChange={(embedding: EmbeddingSettings) => void update({ embedding })}
        />
      )}
    </div>
  );
}
