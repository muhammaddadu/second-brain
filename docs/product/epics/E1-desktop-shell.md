# E1 — Desktop shell & folder navigation

> **This doc owns:** the acceptance state of the desktop-shell epic. **Index:** [epics](index.md). **Layout spec:** [UX hub](../../ux/index.md).

**Status:** Planned · **Depends on:** E0 · **PRD:** §3.3

## Goal

The first runnable app: an Electron + React shell that opens a vault, shows the folder tree in the left panel, and displays a selected note's content in the right panel (read-only rendering is enough — rich editing is E2). Establishes the IPC seam (renderer never touches the filesystem; all vault calls go through core in the main process) and the desktop E2E harness.

## Deliverables

- `apps/desktop`: Electron + React + Vite app; vault picker (or configured vault path); two-panel layout per the [UX wireframe](../../ux/index.md).
- Folder tree component bound to core's tree listing; click opens a note.
- Read-only note view rendered from the selected note's blocks.
- Desktop E2E harness (e.g. Playwright driving the Electron app) with a first passing spec.

## Acceptance criteria

### Functional

- [ ] App launches on the developer's platform and opens a fixture vault (PRD §3.3).
- [ ] Left panel renders the vault's folder hierarchy; folders expand/collapse; clicking a note selects it (PRD §3.3).
- [ ] Right panel shows the selected note's content (PRD §3.3).
- [ ] All vault access goes through core in the main process via IPC — no `fs` use in the renderer (AGENTS.md architecture rule).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] An E2E spec launches the app against a fixture vault, expands a folder, clicks a note, and asserts its content is visible.

## Notes

Cross-platform packaging for all three OSes is *not* gated here — it must build and run on the dev machine; full packaging is revisited after E6 (see epics index → out of scope).
