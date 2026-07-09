/**
 * First-run welcome screen. Instead of dropping the user into a raw OS folder picker (which
 * invites pointing the app at a huge existing directory like ~/Documents), we offer to create a
 * fresh, dedicated vault in one click — and, if they've used the app before, to reopen a recent
 * vault. "Open an existing folder" stays available for power users.
 */

import { ChevronRight, FolderOpen, FolderPlus, NotebookPen } from 'lucide-react';
import { useState } from 'react';
import type { RecentVault, VaultInfo } from '../../shared/ipc';

function prettyPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="from-paper to-surface flex h-full items-center justify-center bg-gradient-to-b px-6">
      <div className="w-full max-w-md">
        <div className="bg-accent/12 text-accent mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl">
          <NotebookPen size={24} strokeWidth={1.75} />
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Welcome to Second Brain
        </h1>
        <p className="text-muted mt-2 text-sm leading-relaxed">
          A vault is a normal folder — Second Brain keeps a small hidden index inside it. Start
          fresh, or open a folder you’ve used before.
        </p>

        <div className="mt-7 space-y-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.vault.createVault())}
            data-testid="create-vault"
            className="bg-accent text-accent-ink hover:opacity-90 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-opacity disabled:opacity-60"
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
          <div className="mt-7">
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
