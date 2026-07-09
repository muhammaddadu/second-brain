/**
 * The header "context bar" — an org/tenant-style switcher for the current vault. The app remembers
 * and auto-opens the last vault; this is how you change it: reopen a recent vault, open a folder,
 * or create a new one. Switching swaps the current vault in main and remounts the workspace.
 */
import { Check, ChevronsUpDown, FolderOpen, FolderPlus, NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RecentVault, VaultInfo } from '../../shared/ipc';

function prettyPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}

export function VaultSwitcher({
  current,
  onSwitch,
}: {
  current: VaultInfo;
  onSwitch: (info: VaultInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentVault[]>([]);

  useEffect(() => {
    if (!open) return;
    window.vault.recentVaults().then(setRecents).catch(console.error);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function act(fn: () => Promise<VaultInfo | null>) {
    setOpen(false);
    try {
      const info = await fn();
      if (info) onSwitch(info);
    } catch (error) {
      // A vault that failed to open (moved/permission) shouldn't crash the header.
      console.error(error);
    }
  }

  return (
    <div className="app-no-drag relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="hover:bg-edge/50 flex items-center gap-2 rounded-lg px-2 py-1 text-sm"
      >
        <NotebookPen size={16} strokeWidth={1.75} className="text-accent" aria-hidden />
        <span className="font-semibold" data-testid="vault-name">
          {current.name}
        </span>
        <ChevronsUpDown size={13} className="text-faint" aria-hidden />
      </button>

      {open && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: transient menu, closes on outside click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="border-edge bg-raised animate-pop absolute top-full left-0 z-50 mt-1 w-72 overflow-hidden rounded-xl border py-1 text-sm shadow-md"
            data-testid="vault-switcher-menu"
          >
            {recents.length > 0 && (
              <>
                <div className="text-faint px-3 pt-1.5 pb-1 text-[10px] font-medium tracking-wide uppercase">
                  Vaults
                </div>
                {recents.map((vault) => {
                  const active = vault.path === current.root;
                  return (
                    <button
                      key={vault.path}
                      type="button"
                      onClick={() => void act(() => window.vault.openRecent(vault.path))}
                      className="hover:bg-surface flex w-full items-center gap-2 px-3 py-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{vault.name}</span>
                        <span className="text-muted block truncate text-xs">
                          {prettyPath(vault.path)}
                        </span>
                      </span>
                      {active && <Check size={15} className="text-accent shrink-0" aria-hidden />}
                    </button>
                  );
                })}
                <div className="border-edge my-1 border-t" />
              </>
            )}
            <button
              type="button"
              onClick={() => void act(() => window.vault.pickVault())}
              className="hover:bg-surface flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
            >
              <FolderOpen size={16} strokeWidth={1.75} className="text-muted" aria-hidden />
              Open a folder…
            </button>
            <button
              type="button"
              onClick={() => void act(() => window.vault.createVault())}
              className="hover:bg-surface flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
            >
              <FolderPlus size={16} strokeWidth={1.75} className="text-muted" aria-hidden />
              New vault…
            </button>
          </div>
        </>
      )}
    </div>
  );
}
