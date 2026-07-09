/**
 * App shell. At launch it asks main whether a vault is open (`ready`) or first-run setup is needed
 * (`setup`) and shows the welcome screen accordingly. Once ready: header + two panels (folder tree,
 * note view) per the ux/index.md wireframe. Tree data flows from core through the preload bridge;
 * the renderer holds only UI state. A watcher subscription refreshes the tree live (E3).
 */
import type { TreeNode } from '@brain/core';
import { NotebookPen, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VaultInfo } from '../../shared/ipc';
import { FolderTree } from './FolderTree';
import { NoteView } from './NoteView';
import { Onboarding } from './Onboarding';

type Phase =
  | { name: 'loading' }
  | { name: 'setup'; recent: { name: string; path: string }[]; suggestedPath: string }
  | { name: 'ready'; info: VaultInfo };

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

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
  return <Workspace info={phase.info} />;
}

function Workspace({ info }: { info: VaultInfo }) {
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
      <header className="border-edge flex items-center justify-between border-b px-4 py-2.5">
        <div className="text-ink flex items-center gap-2">
          <NotebookPen size={17} strokeWidth={1.75} className="text-accent" aria-hidden />
          <span className="text-sm font-semibold" data-testid="vault-name">
            {info.name}
          </span>
        </div>
        <button
          type="button"
          disabled
          title="Search arrives in E4"
          className="border-edge text-faint hover:text-muted flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
        >
          <Search size={14} strokeWidth={2} />
          <span>Search</span>
          <kbd className="text-faint ml-1 font-sans">⌘K</kbd>
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="border-edge bg-surface w-64 shrink-0 overflow-y-auto border-r py-2">
          <FolderTree
            nodes={tree}
            selectedPath={selected}
            onSelect={setSelected}
            onRefresh={refreshTree}
          />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <NoteView path={selected} />
        </main>
      </div>
    </div>
  );
}
