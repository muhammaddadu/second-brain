/**
 * Left-panel folder tree, bound to core's tree listing. Folders expand/collapse (session-only
 * state, never written to the vault); clicking a note selects it. Right-click actions are E3.
 */
import type { TreeNode } from '@brain/core';
import { useState } from 'react';

interface FolderTreeProps {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FolderTree({ nodes, selectedPath, onSelect }: FolderTreeProps) {
  if (nodes.length === 0) {
    return <p className="text-muted px-3 py-2 text-xs italic">This vault is empty.</p>;
  }
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function TreeItem({ node, depth, selectedPath, onSelect }: TreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const indent = { paddingLeft: `${depth * 14 + 10}px` };

  if (node.type === 'folder') {
    const children = node.children ?? [];
    return (
      <li>
        <button
          type="button"
          style={indent}
          onClick={() => setExpanded((e) => !e)}
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
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
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
