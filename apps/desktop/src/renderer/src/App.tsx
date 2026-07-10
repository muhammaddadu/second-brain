/**
 * App shell. At launch it asks main whether a vault is open (`ready`) or first-run setup is needed
 * (`setup`) and shows the welcome screen accordingly. Once ready: header + two panels (folder tree,
 * note view) per the ux/index.md wireframe. Tree data flows from core through the preload bridge;
 * the renderer holds only UI state. A watcher subscription refreshes the tree live (E3).
 */
import type { TreeNode } from '@brain/core';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Network,
  Search,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appearance, IndexStatus, VaultInfo } from '../../shared/ipc';
import { DEFAULT_ROUTE, type Route, routeFromUrl } from '../../shared/route';
import { DatabaseView } from './database/DatabaseView';
import { NoteView } from './editor/NoteView';
import { GraphView } from './search/GraphView';
import { SearchPalette } from './search/SearchPalette';
import { SettingsPage } from './settings/SettingsPage';
import {
  canGoBack,
  canGoForward,
  current,
  go,
  initHistory,
  type NavHistory,
  push,
  replace,
} from './shell/history';
import { ImportProgress } from './shell/ImportProgress';
import { Onboarding } from './shell/Onboarding';
import { UpdateBanner } from './shell/UpdateBanner';
import { useUndo } from './shell/useUndo';
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
  // Browser-style navigation history (back/forward). `route` is the current entry.
  const [history, setHistory] = useState<NavHistory>(() =>
    initHistory(initialRoute ? routeFromUrl(initialRoute) : DEFAULT_ROUTE),
  );
  const route = current(history);
  const navigate = useCallback((r: Route) => setHistory((h) => push(h, r)), []);
  const replaceRoute = useCallback((r: Route) => setHistory((h) => replace(h, r)), []);
  const goBack = useCallback(() => setHistory((h) => go(h, -1)), []);
  const goForward = useCallback(() => setHistory((h) => go(h, 1)), []);
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
        // Replace (not push) the initial blank entry so Back doesn't return to an empty view.
        if (first)
          setHistory((h) => {
            const cur = current(h);
            return cur.name === 'note' && cur.path === null
              ? replace(h, { name: 'note', path: first })
              : h;
          });
      }
    } catch (error) {
      // e.g. the vault directory was removed out from under us; keep the last known tree.
      console.error(error);
    }
  }, []);

  const undoMgr = useUndo(() => void refreshTree());

  useEffect(() => {
    void refreshTree();
    const unsubscribeChange = window.vault.onVaultChange(() => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refreshTree(), 150);
    });
    // Deep links / CLI "open to page" navigate the workspace.
    const unsubscribeNav = window.vault.onNavigate((url) => navigate(routeFromUrl(url)));
    const unsubscribeIndex = window.vault.onIndexStatus(setIndexStatus);
    // ⌘K search; ⌘[ / ⌘] (and the mouse back/forward buttons) walk navigation history.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      } else if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        goBack();
      } else if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault();
        goForward();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) goBack();
      else if (e.button === 4) goForward();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      unsubscribeChange();
      unsubscribeNav();
      unsubscribeIndex();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouseUp);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [refreshTree, navigate, goBack, goForward]);

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
          <div className="app-no-drag flex items-center gap-0.5">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack(history)}
              title="Back (⌘[)"
              aria-label="Back"
              data-testid="nav-back"
              className="text-muted enabled:hover:text-ink enabled:hover:bg-edge/50 rounded-md p-1 disabled:opacity-30"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={goForward}
              disabled={!canGoForward(history)}
              title="Forward (⌘])"
              aria-label="Forward"
              data-testid="nav-forward"
              className="text-muted enabled:hover:text-ink enabled:hover:bg-edge/50 rounded-md p-1 disabled:opacity-30"
            >
              <ChevronRight size={17} />
            </button>
          </div>
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
            onClick={() => navigate({ name: 'graph' })}
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
              onSelect={(path) => navigate({ name: 'note', path })}
              onOpenDatabase={(path) => navigate({ name: 'database', path })}
              onRefresh={refreshTree}
              recordUndo={undoMgr.record}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate({ name: 'settings' })}
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
            <GraphView onOpenNote={(path) => navigate({ name: 'note', path })} />
          ) : route.name === 'database' ? (
            <DatabaseView
              folder={route.path}
              onOpenNote={(path) => navigate({ name: 'note', path })}
            />
          ) : (
            <NoteView
              path={selectedPath}
              onOpenNote={(path) => navigate({ name: 'note', path })}
              onRenamed={(newPath) => {
                replaceRoute({ name: 'note', path: newPath }); // rename ≠ a new history step
                void refreshTree();
              }}
            />
          )}
        </main>
      </div>
      <UpdateBanner />
      <ImportProgress />
      {undoMgr.toast && (
        <div
          role="status"
          data-testid="undo-toast"
          className="border-edge bg-raised animate-pop fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 shadow-md"
        >
          <span className="text-ink text-sm">{undoMgr.toast.text}</span>
          {undoMgr.toast.canUndo && (
            <button
              type="button"
              onClick={() => void undoMgr.undo()}
              className="text-accent text-sm font-medium"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={undoMgr.dismiss}
            aria-label="Dismiss"
            className="text-faint hover:text-ink text-xs"
          >
            ✕
          </button>
        </div>
      )}
      {searchOpen && (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          onOpenNote={(path) => navigate({ name: 'note', path })}
        />
      )}
    </div>
  );
}
