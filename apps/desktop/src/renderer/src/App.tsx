/**
 * App shell: header + two panels (folder tree, note view), matching the ux/index.md wireframe.
 * Vault data is fetched once through the preload bridge; the renderer holds only UI state
 * (selection, expansion) — never vault truth (app-architecture.md).
 */
import type { TreeNode } from '@brain/core';
import { useEffect, useState } from 'react';
import type { VaultInfo } from '../../shared/ipc';
import { FolderTree } from './FolderTree';
import { NoteView } from './NoteView';

export function App() {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    window.vault.info().then(setInfo).catch(console.error);
    window.vault.tree().then(setTree).catch(console.error);
  }, []);

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
          <FolderTree nodes={tree} selectedPath={selected} onSelect={setSelected} />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <NoteView path={selected} />
        </main>
      </div>
    </div>
  );
}
