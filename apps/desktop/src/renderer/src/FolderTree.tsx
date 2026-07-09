/**
 * Left-panel folder tree and vault manager (E1 navigation + E3 actions). Expansion state lives here
 * (lifted) so creating inside a folder keeps it open and a freshly-created folder can drop straight
 * into inline rename. Right-click opens a context menu wired to core operations for both notes and
 * folders (new note/folder, rename, move, delete-to-trash, edit tags). After any action it refreshes
 * the tree immediately; the watcher keeps it live for external changes.
 */
import type { TreeNode } from '@brain/core';
import { ChevronDown, ChevronRight, FileText, FolderPlus } from 'lucide-react';
import { useRef, useState } from 'react';
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

/** Where a drop would land: inside a folder (or the root, path ''), or adjacent to a sibling row. */
interface DropHint {
  path: string;
  pos: 'before' | 'after' | 'into';
}

/** The on-disk entry name used to order a child: the dir name for a folder, the filename for a note. */
function entryNameOf(node: TreeNode): string {
  return node.type === 'folder' ? node.name : `${node.name}${NOTE_EXTENSION}`;
}

/** Find a node anywhere in the tree by its vault-relative path. */
function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const inChild = node.children ? findNode(node.children, path) : null;
    if (inChild) return inChild;
  }
  return null;
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
  const currentParent = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

  function canDropInto(dragged: TreeNode | null, target: TreeNode | null): boolean {
    if (!dragged) return false;
    const targetPath = target ? target.path : '';
    if (targetPath === dragged.path) return false; // onto itself
    if (targetPath === currentParent(dragged.path)) return false; // already there
    // A folder can't move into itself or a descendant.
    if (dragged.type === 'folder' && targetPath.startsWith(`${dragged.path}/`)) return false;
    return true;
  }

  /** The children of a folder (or the vault root when `parent` is ''), in current display order. */
  function childrenOf(parent: string): TreeNode[] {
    if (parent === '') return nodes;
    return findNode(nodes, parent)?.children ?? [];
  }

  /**
   * What a drag over `target` at vertical position `frac` (0=top, 1=bottom) means: move `into` a
   * folder, or reorder `before`/`after` the row. Edges of a folder reorder; its middle moves in.
   * Reorder is offered only between current siblings, so a reorder never also has to move a file.
   */
  function dropIntentFor(target: TreeNode, frac: number): DropHint | null {
    const dragged = draggingRef.current;
    if (!dragged || dragged.path === target.path) return null;
    const sameParent = currentParent(dragged.path) === currentParent(target.path);
    if (canDropInto(dragged, target) && target.type === 'folder') {
      if (sameParent && frac < 0.25) return { path: target.path, pos: 'before' };
      if (sameParent && frac > 0.75) return { path: target.path, pos: 'after' };
      return { path: target.path, pos: 'into' };
    }
    if (sameParent) return { path: target.path, pos: frac < 0.5 ? 'before' : 'after' };
    return null;
  }

  function hoverItem(target: TreeNode, frac: number) {
    setDropHint(dropIntentFor(target, frac));
  }

  function dropOnItem(target: TreeNode, frac: number) {
    const dragged = draggingRef.current;
    const intent = dropIntentFor(target, frac);
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
    const names = childrenOf(parent)
      .map(entryNameOf)
      .filter((n) => n !== entryNameOf(dragged));
    let at = names.indexOf(entryNameOf(target));
    if (at < 0) return;
    if (pos === 'after') at += 1;
    names.splice(at, 0, entryNameOf(dragged));
    return guard(async () => {
      await window.vault.setOrder(parent, names);
      await onRefresh();
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
    // biome-ignore lint/a11y/noStaticElementInteractions: right-click + drop surface for root actions
    <div
      className={`min-h-full ${dropHint?.path === '' ? 'bg-accent/5' : ''}`}
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
    return (
      <li className="relative">
        {insertLines}
        <button
          type="button"
          style={indent}
          {...dragProps}
          onClick={() => onToggleExpand(node.path, !isOpen)}
          onContextMenu={openMenu}
          aria-expanded={isOpen}
          className={`${rowClass} text-ink ${hint === 'into' ? 'bg-accent/15 ring-accent/40 ring-1' : 'hover:bg-edge/50'}`}
        >
          {isOpen ? (
            <ChevronDown size={14} className="text-faint shrink-0" aria-hidden />
          ) : (
            <ChevronRight size={14} className="text-faint shrink-0" aria-hidden />
          )}
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
