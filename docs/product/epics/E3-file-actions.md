# E3 — File actions & live vault updates

> **This doc owns:** the acceptance state of the file-actions epic. **Index:** [epics](index.md). **Interaction spec:** [UX hub](../../ux/index.md).

**Status:** Done (2026-07-09) · **Depends on:** E2 · **PRD:** §3.1, §3.3, §4.2

## Goal

Make the left panel a full vault manager: right-click context menu with the file actions (new note, new folder, rename, move, delete-to-trash, tag), plus a file watcher so external changes — an agent writing via CLI/MCP, a git pull, another editor — appear in the app without restart and never clobber open work.

## Deliverables

- Context menu on tree items wired to core operations: new note / new folder / rename / move / delete (to trash) / edit tags.
- Vault file watcher: tree and open note refresh on external create/change/delete.
- Conflict guard: external change to the currently-open note is surfaced (reload or keep-mine), not silently overwritten.

## Acceptance criteria

### Functional

- [x] Every context-menu action performs its core operation and the tree reflects it immediately (PRD §3.3). — `ContextMenu` + `FolderTree` wire New note / New folder / Rename (inline) / Move (dialog) / Delete / Edit tags to core via IPC, each followed by an immediate tree refresh. Create + rename covered by E2E; the underlying `moveNote`/`trashNote`/`createFolder`/`renameNote` core ops are unit-tested in `vault.test.ts`.
- [x] Delete sends to trash and the note is recoverable (PRD §4.2). — context-menu Delete → `trashNote` (core), which moves the file under `.brain/trash/`; `vault.test.ts` asserts the note is gone from its path but present (recoverable) in trash.
- [x] A file added/changed/removed outside the app appears in the tree without restart (PRD §3.1). — core `watchVault` (chokidar) pushes changes over IPC; `App` refreshes the tree (debounced). E2E writes a note file directly on disk and asserts it appears in the tree.
- [x] An external edit to the open note never silently loses either version (PRD §4.2, §7.3 decision). — guarded autosave (`updateNoteBlocksGuarded`, ADR 0002 compare-and-swap; unit-tested to reject a stale write) + a conflict banner (Reload / Keep-mine — both explicit, neither silent). E2E edits the open note out-of-band and asserts the conflict banner appears.
- [x] Lint / typecheck / unit tests / build all pass. — full pipeline green (36 unit tests: 34 core + 2 desktop).

### E2E validation

- [x] An E2E spec creates a note via the context menu, renames it, then modifies a file on disk out-of-band and asserts the UI reflects the external change. — `app.spec.ts` "creates and renames a note via the context menu…"; a second spec covers the open-note conflict banner.

## Notes

- Watcher mechanism: core `watchVault` uses **chokidar** (reliable cross-platform recursive watching) behind a thin interface; the desktop main process forwards events (with a fresh content hash for note writes) to the renderer. Recorded in [tech-stack](../../architecture/tech-stack.md).
- Conflict guard is the ADR 0002 primitive made concrete: reads carry a content hash; the guarded save is a compare-and-swap; the watcher lets the open editor notice an external change and surface **View diff / Reload / Keep-mine**. The editor tracks the set of hashes *it* wrote (blocks, tags, title) and ignores watcher events for those, so your own saves never read as a conflict regardless of event ordering. The diff (`ConflictDiff`) shows a line diff of the on-disk vs. in-editor text so you decide with eyes open.
- Folder operations shipped: core `renameFolder`/`moveFolder`/`trashFolder` (with content), exposed in the folder context menu; the tree remaps expansion + selection across a folder rename/move/delete. Creating a folder enters inline rename immediately, and creating inside a folder keeps it expanded.
- Drag-to-sort shipped in two gestures: **move** (drop a note/folder onto a folder's middle, or onto the sidebar root) reuses `moveNote`/`moveFolder`; **reorder** (drop onto a sibling's top/bottom edge) persists a per-folder `.order.json` sidecar via core `setFolderOrder`, read back by `listTree` ([ADR 0005](../../adr/0005-manual-ordering-per-folder-sidecar.md), [data-model](../../architecture/data-model.md) § Manual order). Reorder is offered only between current siblings, so it never also has to move a file. Both are covered by E2E (drag-to-move persists to disk; drag-to-reorder writes the sidecar) and the ordering logic is unit-tested in `tree.test.ts`.
