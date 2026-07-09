# E3 — File actions & live vault updates

> **This doc owns:** the acceptance state of the file-actions epic. **Index:** [epics](index.md). **Interaction spec:** [UX hub](../../ux/index.md).

**Status:** Planned · **Depends on:** E2 · **PRD:** §3.1, §3.3, §4.2

## Goal

Make the left panel a full vault manager: right-click context menu with the file actions (new note, new folder, rename, move, delete-to-trash, tag), plus a file watcher so external changes — an agent writing via CLI/MCP, a git pull, another editor — appear in the app without restart and never clobber open work.

## Deliverables

- Context menu on tree items wired to core operations: new note / new folder / rename / move / delete (to trash) / edit tags.
- Vault file watcher: tree and open note refresh on external create/change/delete.
- Conflict guard: external change to the currently-open note is surfaced (reload or keep-mine), not silently overwritten.

## Acceptance criteria

### Functional

- [ ] Every context-menu action performs its core operation and the tree reflects it immediately (PRD §3.3).
- [ ] Delete sends to trash and the note is recoverable (PRD §4.2).
- [ ] A file added/changed/removed outside the app appears in the tree without restart (PRD §3.1).
- [ ] An external edit to the open note never silently loses either version (PRD §4.2, §7.3 decision).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] An E2E spec creates a note via the context menu, renames it, then modifies a file on disk out-of-band and asserts the UI reflects the external change.

## Notes

—
