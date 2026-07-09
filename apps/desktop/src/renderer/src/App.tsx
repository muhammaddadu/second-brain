/**
 * App shell: header + two panels (folder tree, note view), matching the ux/index.md wireframe.
 * Tree data flows from core through the preload bridge; the renderer holds only UI state
 * (selection, expansion). A watcher subscription refreshes the tree live when files change on
 * disk — an agent via CLI/MCP, a git pull, another editor (E3).
 */
import type { TreeNode } from '@brain/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VaultInfo } from '../../shared/ipc';
import { FolderTree } from './FolderTree';
import { NoteView } from './NoteView';

export function App() {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshTree = useCallback(async () => {
    setTree(await window.vault.tree());
  }, []);

  useEffect(() => {
    window.vault.info().then(setInfo).catch(console.error);
    void refreshTree();

    // Coalesce bursts of file events into a single tree refresh.
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
      <header className="border-edge flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-accent" aria-hidden>
            ◦
          </span>
          <span className="font-medium" data-testid="vault-name">
            {info?.name ?? '…'}
          </span>
        </div>
        <button
          type="button"
          disabled
          title="Search arrives in E4"
          className="bg-surface text-muted cursor-default rounded-md px-3 py-1 text-sm"
        >
          🔍 Search… (⌘K)
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="border-edge bg-surface w-64 shrink-0 overflow-y-auto border-r py-2 text-sm">
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
