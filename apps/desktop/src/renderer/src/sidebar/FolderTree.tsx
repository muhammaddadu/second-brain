/**
 * Left-panel folder tree and vault manager (E1 navigation + E3 actions). Expansion state lives here
 * (lifted) so creating inside a folder keeps it open and a freshly-created folder can drop straight
 * into inline rename. Right-click opens a context menu wired to core operations for both notes and
 * folders (new note/folder, rename, move, delete-to-trash, edit tags). After any action it refreshes
 * the tree immediately; the watcher keeps it live for external changes.
 */
import type { TreeNode } from '@brain/core';
import { NOTE_EXTENSION } from '@brain/core/paths';
import { ChevronDown, ChevronRight, Database, FileText, FolderPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { ContextMenu, type MenuItem } from './ContextMenu';
import {
  canDropInto,
  collectFolders,
  currentParent,
  type DropHint,
  dropIntentFor,
  findNode,
  flattenVisible,
  remapPath,
  reorderedNames,
} from './folder-tree-logic';
import { MoveDialog } from './MoveDialog';

interface FolderTreeProps {
  nodes: TreeNode[];
  selectedPath: string | null;
  /** Folder paths that are databases (contain a database.json) — badged and open as a table. */
  databases: ReadonlySet<string>;
  onSelect: (path: string | null) => void;
  onOpenDatabase: (path: string) => void;
  onRefresh: () => Promise<void>;
}

interface MenuState {
  node: TreeNode | null; // null = vault root
  x: number;
  y: number;
}

export function FolderTree({
  nodes,
  selectedPath,
  databases,
  onSelect,
  onOpenDatabase,
  onRefresh,
}: FolderTreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<TreeNode | null>(null);
  // Keyboard focus (roving): the row arrow keys move between; Enter opens, Delete asks to trash.
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const draggingRef = useRef<TreeNode | null>(null);
  // Where a drop would land: `into` a folder (or the root, path ''), or `before`/`after` a sibling
  // row to reorder. Reordering is only offered among items that already share a parent.
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

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
  /** Create a fresh database: a new folder with a schema, named inline like New folder. */
  function newDatabase(parent: string) {
    return guard(async () => {
      const path = await window.vault.newFolder(parent, 'New database');
      await window.vault.createDatabase(path);
      if (parent) setExpandedFor(parent, true);
      await onRefresh();
      setRenamingPath(path);
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

  // --- Drag to move (into a folder / the root) and reorder (before/after a sibling) ---

  /** The children of a folder (or the vault root when `parent` is ''), in current display order. */
  function childrenOf(parent: string): TreeNode[] {
    if (parent === '') return nodes;
    return findNode(nodes, parent)?.children ?? [];
  }

  function hoverItem(target: TreeNode, frac: number) {
    setDropHint(dropIntentFor(draggingRef.current, target, frac));
  }

  function dropOnItem(target: TreeNode, frac: number) {
    const dragged = draggingRef.current;
    const intent = dropIntentFor(dragged, target, frac);
    setDropHint(null);
    draggingRef.current = null;
    if (!dragged || !intent) return;
    if (intent.pos === 'into') {
      setExpandedFor(target.path, true);
      void move(dragged, target.path);
    } else {
      void reorder(dragged, target, intent.pos);
    }
  }

  function dropOnRoot() {
    const dragged = draggingRef.current;
    setDropHint(null);
    draggingRef.current = null;
    if (dragged && canDropInto(dragged, null)) void move(dragged, '');
  }

  /** Persist a manual order for `target`'s parent with `dragged` placed just before/after `target`. */
  function reorder(dragged: TreeNode, target: TreeNode, pos: 'before' | 'after') {
    const parent = currentParent(target.path);
    const names = reorderedNames(childrenOf(parent), dragged, target, pos);
    if (!names) return;
    return guard(async () => {
      await window.vault.setOrder(parent, names);
      await onRefresh();
    });
  }

  /** Arrow/Enter/Delete keyboard navigation over the visible rows (scoped to the tree container). */
  function onTreeKeyDown(e: React.KeyboardEvent) {
    // Never hijack typing in an inline-rename input (events bubble up to this container).
    if ((e.target as HTMLElement).closest('input, [contenteditable="true"]')) return;
    const visible = flattenVisible(nodes, expanded);
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.path === focusedPath);
    const focusNode = idx >= 0 ? (visible[idx] ?? null) : null;
    const move = (next: number) => {
      const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
      if (target) setFocusedPath(target.path);
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(idx < 0 ? 0 : idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(idx < 0 ? 0 : idx - 1);
        break;
      case 'ArrowRight':
        if (focusNode?.type === 'folder') {
          e.preventDefault();
          setExpandedFor(focusNode.path, true);
        }
        break;
      case 'ArrowLeft':
        if (focusNode?.type === 'folder' && expanded.has(focusNode.path)) {
          e.preventDefault();
          setExpandedFor(focusNode.path, false);
        } else if (focusNode && currentParent(focusNode.path)) {
          e.preventDefault();
          setFocusedPath(currentParent(focusNode.path));
        }
        break;
      case 'Enter':
        if (!focusNode) break;
        e.preventDefault();
        if (focusNode.type === 'note') onSelect(focusNode.path);
        else if (databases.has(focusNode.path)) {
          onOpenDatabase(focusNode.path);
          setExpandedFor(focusNode.path, true);
        } else setExpandedFor(focusNode.path, !expanded.has(focusNode.path));
        break;
      case 'Delete':
      case 'Backspace':
        if (focusNode) {
          e.preventDefault();
          setConfirmTrash(focusNode);
        }
        break;
      default:
        break;
    }
  }

  function menuItems(node: TreeNode | null): MenuItem[] {
    if (node === null) {
      return [
        { label: 'New note', onClick: () => void newNote('') },
        { label: 'New folder', onClick: () => void newFolder('') },
        { label: 'New database', onClick: () => void newDatabase('') },
      ];
    }
    if (node.type === 'folder') {
      return [
        { label: 'New note', onClick: () => void newNote(node.path) },
        { label: 'New folder', onClick: () => void newFolder(node.path) },
        { label: 'New database', onClick: () => void newDatabase(node.path) },
        ...(databases.has(node.path)
          ? [{ label: 'Open as database', onClick: () => onOpenDatabase(node.path) } as MenuItem]
          : []),
        { label: 'Rename', onClick: () => setRenamingPath(node.path) },
        { label: 'Move to…', onClick: () => setMoving(node) },
        { label: 'Delete', danger: true, onClick: () => setConfirmTrash(node) },
      ];
    }
    return [
      { label: 'Rename', onClick: () => setRenamingPath(node.path) },
      { label: 'Move to…', onClick: () => setMoving(node) },
      { label: 'Edit tags', onClick: () => onSelect(node.path) },
      { label: 'Delete', danger: true, onClick: () => setConfirmTrash(node) },
    ];
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: right-click + drop surface for root actions
    <div
      className={`min-h-full outline-none ${dropHint?.path === '' ? 'bg-accent/5' : ''}`}
      data-testid="folder-tree"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the tree is a keyboard-navigable widget (roving focus)
      tabIndex={0}
      onKeyDown={onTreeKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ node: null, x: e.clientX, y: e.clientY });
      }}
      onDragOver={(e) => {
        if (canDropInto(draggingRef.current, null)) {
          e.preventDefault();
          setDropHint({ path: '', pos: 'into' });
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dropOnRoot();
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
              dropHint={dropHint}
              databases={databases}
              focusedPath={focusedPath}
              onFocusNode={setFocusedPath}
              onOpenDatabase={onOpenDatabase}
              onToggleExpand={setExpandedFor}
              onSelect={onSelect}
              onOpenMenu={(n, x, y) => setMenu({ node: n, x, y })}
              onCommitRename={commitRename}
              onCancelRename={() => setRenamingPath(null)}
              onDragStartNode={(n) => {
                draggingRef.current = n;
              }}
              onDragEndNode={() => {
                draggingRef.current = null;
                setDropHint(null);
              }}
              onHoverItem={hoverItem}
              onDropOnItem={dropOnItem}
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
      {confirmTrash && (
        <ConfirmDialog
          title={confirmTrash.type === 'folder' ? 'Delete folder?' : 'Delete note?'}
          body={`"${confirmTrash.name}" ${confirmTrash.type === 'folder' ? 'and everything inside it ' : ''}will move to the vault trash. You can restore it from .brain/trash.`}
          confirmLabel="Move to trash"
          onConfirm={() => {
            const node = confirmTrash;
            setConfirmTrash(null);
            void trash(node);
          }}
          onCancel={() => setConfirmTrash(null)}
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
  dropHint: DropHint | null;
  databases: ReadonlySet<string>;
  focusedPath: string | null;
  onFocusNode: (path: string) => void;
  onOpenDatabase: (path: string) => void;
  onToggleExpand: (path: string, open: boolean) => void;
  onSelect: (path: string | null) => void;
  onOpenMenu: (node: TreeNode, x: number, y: number) => void;
  onCommitRename: (node: TreeNode, newBase: string) => void;
  onCancelRename: () => void;
  onDragStartNode: (node: TreeNode) => void;
  onDragEndNode: () => void;
  /** Report a drag hovering this row at vertical fraction `frac` (0=top … 1=bottom). */
  onHoverItem: (node: TreeNode, frac: number) => void;
  onDropOnItem: (node: TreeNode, frac: number) => void;
}

/** Pointer position within a row as a 0..1 fraction from its top — drives before/after/into intent. */
function rowFraction(e: React.DragEvent): number {
  const rect = e.currentTarget.getBoundingClientRect();
  return rect.height === 0 ? 0.5 : (e.clientY - rect.top) / rect.height;
}

function TreeItem(props: TreeItemProps) {
  const { node, depth, selectedPath, renamingPath, expanded, dropHint, onToggleExpand, onSelect } =
    props;
  const isOpen = expanded.has(node.path);
  const indent = { paddingLeft: `${depth * 14 + 8}px` };
  const hint = dropHint?.path === node.path ? dropHint.pos : null;
  const focusRing = props.focusedPath === node.path ? 'ring-accent/50 ring-1' : '';
  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      props.onDragStartNode(node);
    },
    onDragEnd: () => props.onDragEndNode(),
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      props.onHoverItem(node, rowFraction(e));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      props.onDropOnItem(node, rowFraction(e));
    },
  };
  // Insertion lines for reorder; drawn inside the row's <li> so a folder's "after" sits below its
  // whole subtree (where the item would land), not just below the folder's own row.
  const insertLines = (
    <>
      {hint === 'before' && (
        <div className="bg-accent pointer-events-none absolute inset-x-1 -top-px z-10 h-0.5 rounded-full" />
      )}
      {hint === 'after' && (
        <div className="bg-accent pointer-events-none absolute inset-x-1 -bottom-px z-10 h-0.5 rounded-full" />
      )}
    </>
  );

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
    const isDatabase = props.databases.has(node.path);
    return (
      <li className="relative">
        {insertLines}
        <button
          type="button"
          style={indent}
          {...dragProps}
          onClick={() => {
            props.onFocusNode(node.path);
            // A database folder opens its table view; a plain folder just expands/collapses.
            if (isDatabase) {
              props.onOpenDatabase(node.path);
              onToggleExpand(node.path, true);
            } else {
              onToggleExpand(node.path, !isOpen);
            }
          }}
          onContextMenu={openMenu}
          aria-expanded={isOpen}
          className={`${rowClass} text-ink ${hint === 'into' ? 'bg-accent/15 ring-accent/40 ring-1' : `hover:bg-edge/50 ${focusRing}`}`}
        >
          {isOpen ? (
            <ChevronDown size={14} className="text-faint shrink-0" aria-hidden />
          ) : (
            <ChevronRight size={14} className="text-faint shrink-0" aria-hidden />
          )}
          {isDatabase && <Database size={13} className="text-accent shrink-0" aria-hidden />}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isOpen && children.length > 0 && (
          <ul className="animate-reveal">
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
    <li className="relative">
      {insertLines}
      <button
        type="button"
        style={indent}
        {...dragProps}
        onClick={() => {
          props.onFocusNode(node.path);
          onSelect(node.path);
        }}
        onContextMenu={openMenu}
        aria-current={selected}
        className={`${rowClass} ${focusRing} ${
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
