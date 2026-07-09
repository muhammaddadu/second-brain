/**
 * First-run welcome. Designed for a low-cognitive-load, great-feeling first minute: a small
 * animated concept diagram carries the idea (you + your AI agents share one vault) instead of a
 * wall of text, then one obvious action. Entrance animations stagger in and respect reduced-motion
 * (neutralized globally in styles.css). See ux/index.md § First run.
 */
import { ChevronRight, FolderOpen, FolderPlus } from 'lucide-react';
import { useState } from 'react';
import type { RecentVault, VaultInfo } from '../../shared/ipc';

function prettyPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}

/** A warm, minimal illustration: a floating note card resting on a second one — paper, not a flowchart. */
function WelcomeArt() {
  return (
    <svg viewBox="0 0 240 170" className="mx-auto h-40 w-auto" role="img" aria-label="A note card">
      <title>Your notes, on paper you own</title>
      <defs>
        <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#2c2822" floodOpacity="0.14" />
        </filter>
      </defs>
      {/* card behind, slightly rotated — hints at a stack */}
      <rect
        x="74"
        y="30"
        width="92"
        height="108"
        rx="13"
        fill="var(--surface)"
        stroke="var(--edge)"
        transform="rotate(-7 120 84)"
      />
      {/* front card floats gently */}
      <g className="animate-float">
        <g transform="rotate(4 120 92)">
          <rect
            x="64"
            y="40"
            width="112"
            height="112"
            rx="15"
            fill="var(--raised)"
            stroke="var(--edge)"
            filter="url(#cardShadow)"
          />
          {/* title accent + body lines + a little tag — reads as a note without any text */}
          <rect x="82" y="62" width="46" height="8" rx="4" fill="var(--accent)" />
          <rect x="82" y="82" width="78" height="6" rx="3" fill="var(--muted)" fillOpacity="0.32" />
          <rect x="82" y="95" width="78" height="6" rx="3" fill="var(--muted)" fillOpacity="0.32" />
          <rect
            x="82"
            y="108"
            width="50"
            height="6"
            rx="3"
            fill="var(--muted)"
            fillOpacity="0.32"
          />
          <rect
            x="82"
            y="124"
            width="34"
            height="14"
            rx="7"
            fill="var(--surface)"
            stroke="var(--edge)"
          />
        </g>
      </g>
    </svg>
  );
}

export function Onboarding({
  recent,
  suggestedPath,
  onReady,
}: {
  recent: RecentVault[];
  suggestedPath: string;
  onReady: (info: VaultInfo) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<VaultInfo | null>) {
    if (busy) return;
    setBusy(true);
    try {
      const info = await action();
      if (info) onReady(info);
    } catch (error) {
      // e.g. the chosen folder can't be created/opened — stay on the welcome screen.
      console.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      {/* Draggable region so the frameless window can be moved from the welcome screen. */}
      <div className="app-drag fixed inset-x-0 top-0 h-11" />
      <div className="w-full max-w-md">
        <div className="animate-rise mb-7">
          <WelcomeArt />
        </div>

        <h1
          className="animate-rise text-center text-2xl font-semibold"
          style={{ animationDelay: '140ms' }}
        >
          Second Brain
        </h1>
        <p
          className="text-muted animate-rise mt-1.5 text-center text-sm"
          style={{ animationDelay: '200ms' }}
        >
          A local notes vault you and your AI agents share.
        </p>

        <div className="animate-rise mt-7 space-y-2.5" style={{ animationDelay: '280ms' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.vault.createVault())}
            data-testid="create-vault"
            className="bg-accent text-accent-ink flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <FolderPlus size={20} strokeWidth={1.75} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Create a new vault</span>
              <span className="block truncate text-xs opacity-80">{prettyPath(suggestedPath)}</span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.vault.pickVault())}
            className="border-edge bg-raised hover:border-accent/50 flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60"
          >
            <FolderOpen size={20} strokeWidth={1.75} className="text-muted shrink-0" />
            <span className="text-sm font-medium">Open an existing folder…</span>
          </button>
        </div>

        {recent.length > 0 && (
          <div className="animate-rise mt-7" style={{ animationDelay: '360ms' }}>
            <h2 className="text-faint mb-2 text-xs font-medium tracking-wide uppercase">Recent</h2>
            <ul className="border-edge divide-edge divide-y overflow-hidden rounded-lg border">
              {recent.map((vault) => (
                <li key={vault.path}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => window.vault.openRecent(vault.path))}
                    className="hover:bg-surface flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{vault.name}</span>
                      <span className="text-muted block truncate text-xs">
                        {prettyPath(vault.path)}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-faint shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
