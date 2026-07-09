/**
 * User preferences. A small, clean panel — the seam for more settings over time. Today it exposes
 * what's genuinely configurable: appearance theme (System/Light/Dark) and window translucency.
 * Changes apply live via the main process (nativeTheme / vibrancy) and persist in the app config.
 */
import { Monitor, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/ipc';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function SettingsDialog({ onClose }: { onClose: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: closes on outside click; Esc not required */}
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="border-edge bg-raised relative w-96 rounded-xl border p-5 shadow-md"
        data-testid="settings-dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="text-muted hover:bg-surface hover:text-ink flex h-7 w-7 items-center justify-center rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        {settings && (
          <section>
            <h3 className="text-faint mb-2 text-xs font-medium tracking-wide uppercase">
              Appearance
            </h3>

            <div className="mb-4">
              <div className="text-ink mb-1.5 text-sm">Theme</div>
              <div className="border-edge bg-surface flex gap-1 rounded-lg border p-1">
                {THEME_OPTIONS.map(({ value, label, Icon }) => {
                  const active = settings.theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => void update({ theme: value })}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs ${
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

            <label className="flex cursor-pointer items-center justify-between">
              <span className="min-w-0">
                <span className="text-ink block text-sm">Reduce transparency</span>
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
      </div>
    </div>
  );
}
