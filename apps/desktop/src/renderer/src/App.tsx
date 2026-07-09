/**
 * App shell. At launch it asks main whether a vault is open (`ready`) or first-run setup is needed
 * (`setup`) and shows the welcome screen accordingly. Once ready: header + two panels (folder tree,
 * note view) per the ux/index.md wireframe. Tree data flows from core through the preload bridge;
 * the renderer holds only UI state. A watcher subscription refreshes the tree live (E3).
 */
import type { TreeNode } from '@brain/core';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appearance, VaultInfo } from '../../shared/ipc';
import { FolderTree } from './FolderTree';
import { NoteView } from './NoteView';
import { Onboarding } from './Onboarding';
import { VaultSwitcher } from './VaultSwitcher';

type Phase =
  | { name: 'loading' }
  | { name: 'setup'; recent: { name: string; path: string }[]; suggestedPath: string }
  | { name: 'ready'; info: VaultInfo };

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
        if (state.mode === 'ready') setPhase({ name: 'ready', info: state.info });
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
      onSwitch={(info) => setPhase({ name: 'ready', info })}
    />
  );
}

function Workspace({ info, onSwitch }: { info: VaultInfo; onSwitch: (info: VaultInfo) => void }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshTree = useCallback(async () => {
    setTree(await window.vault.tree());
  }, []);

  useEffect(() => {
    void refreshTree();
    const unsubscribe = window.vault.onVaultChange(() => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refreshTree(), 150);
    });
    return () => {
      unsubscribe();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [refreshTree]);

  return (
    <div className="flex h-full flex-col">
      <header className="titlebar app-drag border-edge flex items-center justify-between border-b px-4 py-2">
        <VaultSwitcher current={info} onSwitch={onSwitch} />
        <button
          type="button"
          disabled
          title="Search arrives in E4"
          className="app-no-drag border-edge text-faint hover:text-muted flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
        >
          <Search size={14} strokeWidth={2} />
          <span>Search</span>
          <kbd className="text-faint ml-1 font-sans">⌘K</kbd>
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="sidebar border-edge w-64 shrink-0 overflow-y-auto border-r py-2">
          <FolderTree
            nodes={tree}
            selectedPath={selected}
            onSelect={setSelected}
            onRefresh={refreshTree}
          />
        </nav>
        <main className="content-surface min-w-0 flex-1 overflow-y-auto">
          <NoteView path={selected} />
        </main>
      </div>
    </div>
  );
}
