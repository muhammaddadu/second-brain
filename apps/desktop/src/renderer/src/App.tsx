/**
 * App shell. At launch it asks main whether a vault is open (`ready`) or first-run setup is needed
 * (`setup`) and shows the welcome screen accordingly. Once ready: header + two panels (folder tree,
 * note view) per the ux/index.md wireframe. Tree data flows from core through the preload bridge;
 * the renderer holds only UI state. A watcher subscription refreshes the tree live (E3).
 */
import type { TreeNode } from '@brain/core';
import { Loader2, Network, Search, Settings as SettingsIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appearance, IndexStatus, VaultInfo } from '../../shared/ipc';
import { DEFAULT_ROUTE, type Route, routeFromUrl } from '../../shared/route';
import { DatabaseView } from './database/DatabaseView';
import { NoteView } from './editor/NoteView';
import { GraphView } from './search/GraphView';
import { SearchPalette } from './search/SearchPalette';
import { SettingsPage } from './settings/SettingsPage';
import { ImportProgress } from './shell/ImportProgress';
import { Onboarding } from './shell/Onboarding';
import { UpdateBanner } from './shell/UpdateBanner';
import { VaultSwitcher } from './shell/VaultSwitcher';
import { FolderTree } from './sidebar/FolderTree';
import { firstNotePath } from './sidebar/folder-tree-logic';

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
  const [databases, setDatabases] = useState<ReadonlySet<string>>(new Set());
  const [route, setRoute] = useState<Route>(() =>
    initialRoute ? routeFromUrl(initialRoute) : DEFAULT_ROUTE,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ state: 'idle', done: 0, total: 0 });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Open the first note automatically on launch (once), so the editor starts with content rather
  // than the empty state — unless a deep link already pointed us somewhere specific.
  const autoOpened = useRef(initialRoute !== undefined);

  const refreshTree = useCallback(async () => {
    try {
      const nextTree = await window.vault.tree();
      setTree(nextTree);
      setDatabases(new Set(await window.vault.listDatabases()));
      if (!autoOpened.current) {
        autoOpened.current = true;
        const first = firstNotePath(nextTree);
        if (first)
          setRoute((r) =>
            r.name === 'note' && r.path === null ? { name: 'note', path: first } : r,
          );
      }
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
    const unsubscribeIndex = window.vault.onIndexStatus(setIndexStatus);
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
      unsubscribeIndex();
      window.removeEventListener('keydown', onKey);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [refreshTree]);

  const selectedPath = route.name === 'note' ? route.path : null;

  return (
    <div className="flex h-full flex-col">
      <header className="titlebar app-drag border-edge flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <VaultSwitcher current={info} onSwitch={onSwitch} />
          {__APP_ENV__ !== 'production' && (
            <span
              className="bg-accent/15 text-accent rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
              title={`This is a ${__APP_ENV__} build, installed separately from your production app`}
              data-testid="env-badge"
            >
              {__APP_ENV__ === 'beta' ? 'Beta' : 'Dev'}
            </span>
          )}
        </div>
        <div className="app-no-drag flex items-center gap-2">
          {indexStatus.state !== 'idle' && (
            <span
              className="text-muted flex items-center gap-1.5 text-xs"
              data-testid="index-status"
              title={
                indexStatus.state === 'downloading'
                  ? 'Downloading the on-device model'
                  : 'Building the semantic search index'
              }
            >
              <Loader2 size={13} className="text-accent animate-spin" aria-hidden />
              <span className="tabular-nums">
                {indexStatus.state === 'downloading'
                  ? `Downloading model… ${indexStatus.done}%`
                  : `Indexing ${indexStatus.done}/${indexStatus.total}`}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setRoute({ name: 'graph' })}
            title="Knowledge graph"
            aria-current={route.name === 'graph'}
            data-testid="graph-button"
            className={`border-edge hover:text-ink hover:border-accent/40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${route.name === 'graph' ? 'text-accent' : 'text-muted'}`}
          >
            <Network size={14} strokeWidth={2} />
            <span>Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search your notes"
            data-testid="search-button"
            className="border-edge text-muted hover:text-ink hover:border-accent/40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
          >
            <Search size={14} strokeWidth={2} />
            <span>Search</span>
            <kbd className="text-faint ml-1 font-sans">⌘K</kbd>
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="sidebar border-edge flex w-64 shrink-0 flex-col border-r">
          <div className="scroll-stable min-h-0 flex-1 overflow-y-auto py-2">
            <FolderTree
              nodes={tree}
              selectedPath={selectedPath}
              databases={databases}
              onSelect={(path) => setRoute({ name: 'note', path })}
              onOpenDatabase={(path) => setRoute({ name: 'database', path })}
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
          ) : route.name === 'graph' ? (
            <GraphView onOpenNote={(path) => setRoute({ name: 'note', path })} />
          ) : route.name === 'database' ? (
            <DatabaseView
              folder={route.path}
              onOpenNote={(path) => setRoute({ name: 'note', path })}
            />
          ) : (
            <NoteView
              path={selectedPath}
              onOpenNote={(path) => setRoute({ name: 'note', path })}
              onRenamed={(newPath) => {
                setRoute({ name: 'note', path: newPath });
                void refreshTree();
              }}
            />
          )}
        </main>
      </div>
      <UpdateBanner />
      <ImportProgress />
      {searchOpen && (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          onOpenNote={(path) => setRoute({ name: 'note', path })}
        />
      )}
    </div>
  );
}
