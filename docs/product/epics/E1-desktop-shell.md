# E1 — Desktop shell & folder navigation

> **This doc owns:** the acceptance state of the desktop-shell epic. **Index:** [epics](index.md). **Layout spec:** [UX hub](../../ux/index.md).

**Status:** Done (2026-07-09) · **Depends on:** E0 · **PRD:** §3.3

## Goal

The first runnable app: an Electron + React shell that opens a vault, shows the folder tree in the left panel, and displays a selected note's content in the right panel (read-only rendering is enough — rich editing is E2). Establishes the IPC seam (renderer never touches the filesystem; all vault calls go through core in the main process) and the desktop E2E harness.

## Deliverables

- `apps/desktop`: Electron + React + Vite app; vault picker (or configured vault path); two-panel layout per the [UX wireframe](../../ux/index.md).
- Folder tree component bound to core's tree listing; click opens a note.
- Read-only note view rendered from the selected note's blocks.
- Desktop E2E harness (e.g. Playwright driving the Electron app) with a first passing spec.

## Acceptance criteria

### Functional

- [x] App launches on the developer's platform and opens a fixture vault (PRD §3.3). — electron-vite app in `apps/desktop`; `src/main/index.ts` resolves the vault (`BRAIN_VAULT` env → saved path → folder picker) and opens it via core. Proved by the passing Playwright E2E.
- [x] Left panel renders the vault's folder hierarchy; folders expand/collapse; clicking a note selects it (PRD §3.3). — `FolderTree.tsx` (recursive, session-only expand state); E2E expands a folder and selects a note.
- [x] Right panel shows the selected note's content (PRD §3.3). — `NoteView.tsx` + `blocks/RenderBlocks.tsx` (read-only block renderer); E2E asserts title + body visible.
- [x] All vault access goes through core in the main process via IPC — no `fs` use in the renderer (AGENTS.md architecture rule). — main hosts core + `ipcMain` handlers; `preload/index.ts` exposes a typed `window.vault` over `contextBridge`; renderer imports from `@brain/core` are **type-only** (grep-verified: no `fs`/`require` in `src/renderer`).
- [x] Lint / typecheck / unit tests / build all pass. — `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.

### E2E validation

- [x] An E2E spec launches the app against a fixture vault, expands a folder, clicks a note, and asserts its content is visible. — `apps/desktop/e2e/app.spec.ts` via `_electron`; seeds a temp vault with `@brain/core`, runs against the built app (`pnpm test:e2e`).

## Notes

- IPC seam: channels + the `VaultApi` type live in one place, `apps/desktop/src/shared/ipc.ts`, imported by main, preload, and (type-only) the renderer.
- Electron tooling (electron-vite) and styling (Tailwind v4, warm-paper theme) decided in E1 — recorded in [tech-stack](../../architecture/tech-stack.md#fixed-in-e1-2026-07-09) and [ux/index.md § Visual design](../../ux/index.md).
- Cross-platform packaging for all three OSes is *not* gated here — it builds and runs on the dev machine; full packaging is revisited after E6 (see epics index → out of scope).
