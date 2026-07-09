/**
 * Left-panel folder tree and vault manager (E1 navigation + E3 actions). Expansion state lives here
 * (lifted) so creating inside a folder keeps it open and a freshly-created folder can drop straight
 * into inline rename. Right-click opens a context menu wired to core operations for both notes and
 * folders (new note/folder, rename, move, delete-to-trash, edit tags). After any action it refreshes
 * the tree immediately; the watcher keeps it live for external changes.
 */
import type { TreeNode } from '@brain/core';
import { ChevronDown, ChevronRight, FileText, FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { MoveDialog } from './MoveDialog';

const NOTE_EXTENSION = '.note.json';

interface FolderTreeProps {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onRefresh: () => Promise<void>;
}

interface MenuState {
  node: TreeNode | null; // null = vault root
  x: number;
  y: number;
}

function collectFolders(nodes: TreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'folder') {
      acc.push(node.path);
      if (node.children) collectFolders(node.children, acc);
    }
  }
  return acc;
}

/** Rewrite paths at or under `oldPath` to `newPath` (or drop them if `newPath` is null). */
function remapPath(value: string, oldPath: string, newPath: string | null): string | null {
  if (value === oldPath) return newPath;
  if (value.startsWith(`${oldPath}/`)) {
    return newPath === null ? null : newPath + value.slice(oldPath.length);
  }
  return value;
}

export function FolderTree({ nodes, selectedPath, onSelect, onRefresh }: FolderTreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function setExpandedFor(path: string, open: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  /** Remap expansion + selection after a folder was renamed/moved/deleted. */
  function remapAfterFolderChange(oldPath: string, newPath: string | null) {
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const p of prev) {
        const mapped = remapPath(p, oldPath, newPath);
        if (mapped !== null) next.add(mapped);
      }
      if (newPath) next.add(newPath);
      return next;
    });
    if (selectedPath) onSelect(remapPath(selectedPath, oldPath, newPath));
  }

  async function guard(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      console.error(error);
      await onRefresh();
    }
  }

  function newNote(folder: string) {
    return guard(async () => {
      const path = await window.vault.newNote(folder);
      if (folder) setExpandedFor(folder, true); // keep the folder open
      await onRefresh();
      onSelect(path); // open it for editing (title-driven naming comes later)
    });
  }
  function newFolder(parent: string) {
    return guard(async () => {
      const path = await window.vault.newFolder(parent);
      if (parent) setExpandedFor(parent, true);
      await onRefresh();
      setRenamingPath(path); // let the user name it right away, inline
    });
  }
  function trash(node: TreeNode) {
    return guard(async () => {
      if (node.type === 'folder') {
        await window.vault.trashFolder(node.path);
        await onRefresh();
        remapAfterFolderChange(node.path, null);
      } else {
        await window.vault.trash(node.path);
        await onRefresh();
        if (selectedPath === node.path) onSelect(null);
      }
    });
  }
  function commitRename(node: TreeNode, newBase: string) {
    setRenamingPath(null);
    const trimmed = newBase.trim();
    if (!trimmed || trimmed === node.name) return;
    if (trimmed.includes('/') || trimmed.includes('\\')) return;
    return guard(async () => {
      if (node.type === 'folder') {
        const newPath = await window.vault.renameFolder(node.path, trimmed);
        await onRefresh();
        remapAfterFolderChange(node.path, newPath);
      } else {
        const newPath = await window.vault.rename(node.path, `${trimmed}${NOTE_EXTENSION}`);
        await onRefresh();
        onSelect(newPath);
      }
    });
  }
  function move(node: TreeNode, folder: string) {
    setMoving(null);
    return guard(async () => {
      const name = node.path.split('/').pop() ?? node.path;
      const toPath = folder ? `${folder}/${name}` : name;
      if (node.type === 'folder') {
        await window.vault.moveFolder(node.path, toPath);
        await onRefresh();
        remapAfterFolderChange(node.path, toPath);
      } else {
        await window.vault.move(node.path, toPath);
        await onRefresh();
        onSelect(toPath);
      }
    });
  }

  function menuItems(node: TreeNode | null): MenuItem[] {
    if (node === null) {
      return [
        { label: 'New note', onClick: () => void newNote('') },
        { label: 'New folder', onClick: () => void newFolder('') },
      ];
    }
    if (node.type === 'folder') {
      return [
        { label: 'New note', onClick: () => void newNote(node.path) },
        { label: 'New folder', onClick: () => void newFolder(node.path) },
        { label: 'Rename', onClick: () => setRenamingPath(node.path) },
        { label: 'Move to…', onClick: () => setMoving(node) },
        { label: 'Delete', danger: true, onClick: () => void trash(node) },
      ];
    }
    return [
      { label: 'Rename', onClick: () => setRenamingPath(node.path) },
      { label: 'Move to…', onClick: () => setMoving(node) },
      { label: 'Edit tags', onClick: () => onSelect(node.path) },
      { label: 'Delete', danger: true, onClick: () => void trash(node) },
    ];
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: right-click surface for root actions
    <div
      className="min-h-full"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ node: null, x: e.clientX, y: e.clientY });
      }}
    >
      {nodes.length === 0 ? (
        <div className="text-muted flex flex-col items-start gap-3 px-3 py-6">
          <p className="text-xs leading-relaxed">Your vault is empty.</p>
          <button
            type="button"
            onClick={() => void newNote('')}
            className="border-edge hover:border-accent/50 hover:text-ink flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
          >
            <FolderPlus size={14} strokeWidth={1.75} />
            New note
          </button>
        </div>
      ) : (
        <ul className="flex flex-col px-1">
          {nodes.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
              expanded={expanded}
              onToggleExpand={setExpandedFor}
              onSelect={onSelect}
              onOpenMenu={(n, x, y) => setMenu({ node: n, x, y })}
              onCommitRename={commitRename}
              onCancelRename={() => setRenamingPath(null)}
            />
          ))}
        </ul>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
      {moving && (
        <MoveDialog
          noteName={moving.name}
          folders={collectFolders(nodes).filter((f) => f !== moving.path)}
          onPick={(folder) => void move(moving, folder)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  renamingPath: string | null;
  expanded: ReadonlySet<string>;
  onToggleExpand: (path: string, open: boolean) => void;
  onSelect: (path: string | null) => void;
  onOpenMenu: (node: TreeNode, x: number, y: number) => void;
  onCommitRename: (node: TreeNode, newBase: string) => void;
  onCancelRename: () => void;
}

function TreeItem(props: TreeItemProps) {
  const { node, depth, selectedPath, renamingPath, expanded, onToggleExpand, onSelect } = props;
  const isOpen = expanded.has(node.path);
  const indent = { paddingLeft: `${depth * 14 + 8}px` };

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onOpenMenuFrom(e);
  }
  function onOpenMenuFrom(e: React.MouseEvent) {
    props.onOpenMenu(node, e.clientX, e.clientY);
  }

  if (renamingPath === node.path) {
    return (
      <li>
        <RenameInput
          initial={node.name}
          indent={indent}
          onCommit={(value) => props.onCommitRename(node, value)}
          onCancel={props.onCancelRename}
        />
      </li>
    );
  }

  const rowClass =
    'group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-colors';

  if (node.type === 'folder') {
    const children = node.children ?? [];
    return (
      <li>
        <button
          type="button"
          style={indent}
          onClick={() => onToggleExpand(node.path, !isOpen)}
          onContextMenu={openMenu}
          aria-expanded={isOpen}
          className={`${rowClass} text-ink hover:bg-edge/50`}
        >
          {isOpen ? (
            <ChevronDown size={14} className="text-faint shrink-0" aria-hidden />
          ) : (
            <ChevronRight size={14} className="text-faint shrink-0" aria-hidden />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isOpen && children.length > 0 && (
          <ul>
            {children.map((child) => (
              <TreeItem key={child.path} {...props} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const selected = node.path === selectedPath;
  return (
    <li>
      <button
        type="button"
        style={indent}
        onClick={() => onSelect(node.path)}
        onContextMenu={openMenu}
        aria-current={selected}
        className={`${rowClass} ${
          selected ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-edge/50'
        }`}
      >
        <FileText
          size={14}
          strokeWidth={1.75}
          className={`ml-0.5 shrink-0 ${selected ? 'text-accent' : 'text-faint'}`}
          aria-hidden
        />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

function RenameInput({
  initial,
  indent,
  onCommit,
  onCancel,
}: {
  initial: string;
  indent: React.CSSProperties;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: rename should focus immediately for a fast inline edit
      autoFocus
      value={value}
      aria-label="Rename"
      style={indent}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value);
        if (e.key === 'Escape') onCancel();
      }}
      className="text-ink border-accent/60 bg-raised my-0.5 w-[92%] rounded-md border px-1.5 py-0.5 text-sm outline-none"
    />
  );
}
