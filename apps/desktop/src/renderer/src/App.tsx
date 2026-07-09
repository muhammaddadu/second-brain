/**
 * App shell. At launch it asks main whether a vault is open (`ready`) or first-run setup is needed
 * (`setup`) and shows the welcome screen accordingly. Once ready: header + two panels (folder tree,
 * note view) per the ux/index.md wireframe. Tree data flows from core through the preload bridge;
 * the renderer holds only UI state. A watcher subscription refreshes the tree live (E3).
 */
import type { TreeNode } from '@brain/core';
import { Search, Settings as SettingsIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appearance, VaultInfo } from '../../shared/ipc';
import { DEFAULT_ROUTE, type Route, routeFromUrl } from '../../shared/route';
import { FolderTree } from './FolderTree';
import { NoteView } from './NoteView';
import { Onboarding } from './Onboarding';
import { SearchPalette } from './SearchPalette';
import { SettingsPage } from './SettingsPage';
import { VaultSwitcher } from './VaultSwitcher';

type Phase =
  | { name: 'loading' }
  | { name: 'setup'; recent: { name: string; path: string }[]; suggestedPath: string }
  | { name: 'ready'; info: VaultInfo; route?: string };

/** Stamp the OS appearance onto <html> so CSS adapts (theme, translucency, platform layout). */
function useAppearance() {
  useEffect(() => {
    function apply(a: Appearance) {
      const el = document.documentElement;
      el.dataset.theme = a.theme;
      el.dataset.translucent = String(a.translucent);
      el.dataset.platform = a.platform;
    }
    window.vault.appearance().then(apply).catch(console.error);
    return window.vault.onAppearanceChange(apply);
  }, []);
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  useAppearance();

  useEffect(() => {
    window.vault
      .startup()
      .then((state) => {
        if (state.mode === 'ready')
          setPhase({
            name: 'ready',
            info: state.info,
            ...(state.route ? { route: state.route } : {}),
          });
        else setPhase({ name: 'setup', recent: state.recent, suggestedPath: state.suggestedPath });
      })
      .catch(console.error);
  }, []);

  if (phase.name === 'loading') {
    return (
      <div className="text-muted flex h-full items-center justify-center text-sm">Opening…</div>
    );
  }
  if (phase.name === 'setup') {
    return (
      <Onboarding
        recent={phase.recent}
        suggestedPath={phase.suggestedPath}
        onReady={(info) => setPhase({ name: 'ready', info })}
      />
    );
  }
  return (
    <Workspace
      key={phase.info.root}
      info={phase.info}
      initialRoute={phase.route}
      onSwitch={(info) => setPhase({ name: 'ready', info })}
    />
  );
}

function Workspace({
  info,
  initialRoute,
  onSwitch,
}: {
  info: VaultInfo;
  initialRoute?: string;
  onSwitch: (info: VaultInfo) => void;
}) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [route, setRoute] = useState<Route>(() =>
    initialRoute ? routeFromUrl(initialRoute) : DEFAULT_ROUTE,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshTree = useCallback(async () => {
    try {
      setTree(await window.vault.tree());
    } catch (error) {
      // e.g. the vault directory was removed out from under us; keep the last known tree.
      console.error(error);
    }
  }, []);

  useEffect(() => {
    void refreshTree();
    const unsubscribeChange = window.vault.onVaultChange(() => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refreshTree(), 150);
    });
    // Deep links / CLI "open to page" navigate the workspace.
    const unsubscribeNav = window.vault.onNavigate((url) => setRoute(routeFromUrl(url)));
    // ⌘K / Ctrl+K toggles search from anywhere.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unsubscribeChange();
      unsubscribeNav();
      window.removeEventListener('keydown', onKey);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [refreshTree]);

  const selectedPath = route.name === 'note' ? route.path : null;

  return (
    <div className="flex h-full flex-col">
      <header className="titlebar app-drag border-edge flex items-center justify-between border-b px-4 py-2">
        <VaultSwitcher current={info} onSwitch={onSwitch} />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search your notes"
          data-testid="search-button"
          className="app-no-drag border-edge text-muted hover:text-ink hover:border-accent/40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
        >
          <Search size={14} strokeWidth={2} />
          <span>Search</span>
          <kbd className="text-faint ml-1 font-sans">⌘K</kbd>
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="sidebar border-edge flex w-64 shrink-0 flex-col border-r">
          <div className="scroll-stable min-h-0 flex-1 overflow-y-auto py-2">
            <FolderTree
              nodes={tree}
              selectedPath={selectedPath}
              onSelect={(path) => setRoute({ name: 'note', path })}
              onRefresh={refreshTree}
            />
          </div>
          <button
            type="button"
            onClick={() => setRoute({ name: 'settings' })}
            aria-current={route.name === 'settings'}
            className={`border-edge flex items-center gap-2 border-t px-3 py-2 text-left text-sm ${
              route.name === 'settings'
                ? 'text-accent'
                : 'text-muted hover:bg-edge/50 hover:text-ink'
            }`}
          >
            <SettingsIcon size={15} strokeWidth={1.75} aria-hidden />
            Settings
          </button>
        </nav>
        <main className="content-surface scroll-stable min-w-0 flex-1 overflow-y-auto">
          {route.name === 'settings' ? (
            <SettingsPage />
          ) : (
            <NoteView
              path={selectedPath}
              onRenamed={(newPath) => {
                setRoute({ name: 'note', path: newPath });
                void refreshTree();
              }}
            />
          )}
        </main>
      </div>
      {searchOpen && (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          onOpenNote={(path) => setRoute({ name: 'note', path })}
        />
      )}
    </div>
  );
}
