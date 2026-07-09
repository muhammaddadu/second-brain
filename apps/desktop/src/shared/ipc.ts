/**
 * The renderer↔main contract — one home for IPC channel names and the typed vault API the
 * preload bridge exposes on `window.vault`. The renderer imports only *types* from here and from
 * @brain/core (erased at build), never `fs` or core itself: all vault I/O happens in the main
 * process (AGENTS.md architecture rule; app-architecture.md boundary rules).
 */
import type { NoteEnvelope, TreeNode } from '@brain/core';

export const IPC = {
  vaultInfo: 'vault:info',
  vaultTree: 'vault:tree',
  readNote: 'vault:read-note',
  saveBlocks: 'vault:save-blocks',
  setTags: 'vault:set-tags',
} as const;

/** Summary of the open vault, for the window header. */
export interface VaultInfo {
  name: string;
  root: string;
}

/** The surface exposed to the renderer as `window.vault`. Thin — each call forwards to core. */
export interface VaultApi {
  info(): Promise<VaultInfo>;
  tree(): Promise<TreeNode[]>;
  readNote(path: string): Promise<NoteEnvelope>;
  /** Replace a note's body blocks (editor autosave); metadata is preserved. */
  saveBlocks(path: string, blocks: unknown[]): Promise<void>;
  /** Replace a note's tags; returns the persisted tags. */
  setTags(path: string, tags: string[]): Promise<string[]>;
}
