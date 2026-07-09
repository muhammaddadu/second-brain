/**
 * Left-panel folder tree and vault manager (E1 navigation + E3 actions). Folders expand/collapse
 * (session-only state); clicking a note selects it. Right-click opens a context menu wired to core
 * operations (new note/folder, rename, move, delete-to-trash, edit tags). After any action it
 * refreshes the tree immediately (and the watcher keeps it live for external changes).
 */
import type { TreeNode } from '@brain/core';
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

export function FolderTree({ nodes, selectedPath, onSelect, onRefresh }: FolderTreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);

  async function newNote(folder: string) {
    const path = await window.vault.newNote(folder);
    await onRefresh();
    onSelect(path);
  }
  async function newFolder(parent: string) {
    await window.vault.newFolder(parent);
    await onRefresh();
  }
  async function trash(node: TreeNode) {
    await window.vault.trash(node.path);
    await onRefresh();
    if (selectedPath === node.path) onSelect(null);
  }
  async function commitRename(node: TreeNode, newBase: string) {
    setRenamingPath(null);
    const trimmed = newBase.trim();
    if (!trimmed || trimmed === node.name) return;
    const newPath = await window.vault.rename(node.path, `${trimmed}${NOTE_EXTENSION}`);
    await onRefresh();
    onSelect(newPath);
  }
  async function move(node: TreeNode, folder: string) {
    setMoving(null);
    const name = node.path.split('/').pop() ?? node.path;
    const toPath = folder ? `${folder}/${name}` : name;
    await window.vault.move(node.path, toPath);
    await onRefresh();
    onSelect(toPath);
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
        <p className="text-muted px-3 py-2 text-xs italic">
          Empty vault — right-click to add a note.
        </p>
      ) : (
        <ul className="flex flex-col">
          {nodes.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
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
          folders={collectFolders(nodes)}
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
  onSelect: (path: string | null) => void;
  onOpenMenu: (node: TreeNode, x: number, y: number) => void;
  onCommitRename: (node: TreeNode, newBase: string) => void;
  onCancelRename: () => void;
}

function TreeItem(props: TreeItemProps) {
  const { node, depth, selectedPath, renamingPath, onSelect, onOpenMenu } = props;
  const [expanded, setExpanded] = useState(false);
  const indent = { paddingLeft: `${depth * 14 + 10}px` };

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onOpenMenu(node, e.clientX, e.clientY);
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

  if (node.type === 'folder') {
    const children = node.children ?? [];
    return (
      <li>
        <button
          type="button"
          style={indent}
          onClick={() => setExpanded((e) => !e)}
          onContextMenu={openMenu}
          aria-expanded={expanded}
          className="hover:bg-edge/50 flex w-full items-center gap-1.5 py-1 pr-2 text-left"
        >
          <span aria-hidden className="text-muted w-3 text-xs">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded && children.length > 0 && (
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
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left ${
          selected ? 'bg-accent/15 text-accent' : 'hover:bg-edge/50'
        }`}
      >
        <span aria-hidden className="w-3" />
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
      aria-label="Rename note"
      style={indent}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value);
        if (e.key === 'Escape') onCancel();
      }}
      className="text-ink border-edge my-0.5 w-[90%] rounded border bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}
