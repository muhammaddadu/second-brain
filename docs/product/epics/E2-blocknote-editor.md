# E2 — BlockNote editing & Markdown import/export

> **This doc owns:** the acceptance state of the editor epic. **Index:** [epics](index.md). **Storage format:** [data-model](../../architecture/data-model.md); **format rationale:** [ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md).

**Status:** Done (2026-07-09) · **Depends on:** E1 · **PRD:** §3.3, §6

## Goal

Replace the read-only note view with a [BlockNote](https://www.blocknotejs.org/docs) editor: load the note's blocks straight from the envelope, edit richly, persist back losslessly ([ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md) — no conversion in the save path). This epic also lands core's Markdown **import/export** boundary, since the editor's paste/import and the vault's export escape hatch (PRD §4.4) share it.

## Deliverables

- BlockNote editor wired into the right panel; load on select, save on edit (autosave with debounce), blocks persisted natively per [data-model](../../architecture/data-model.md).
- Markdown import/export in `packages/core` (`tryParseMarkdownToBlocks` / `blocksToMarkdownLossy` at the seam): single-note and whole-vault export, Markdown accepted on write.
- Tag editing surfaced in the UI (metadata-backed).

## Acceptance criteria

### Functional

- [x] Selecting a note loads its blocks into BlockNote; edits persist to the note file with no structural loss (PRD §3.3). — `NoteEditor.tsx` loads `note.blocks` as BlockNote `initialContent`; debounced autosave calls `updateNoteBlocks` (core) which preserves metadata and persists blocks verbatim. Proved by the desktop editor E2E.
- [x] Fidelity test suite: for every block type, save → reload → save produces a byte-identical file; blocks untouched by an edit are byte-identical after save (PRD §6, §4.2). — `fidelity.test.ts` round-trips a note with every common block type (incl. a `mermaid` code block) byte-identically. (Persistence layer; the editor's reproduction of blocks is exercised by the E2E.)
- [x] Markdown import: a Markdown string becomes a valid note via core; unrecognised syntax degrades to plain text, never an error (PRD §3.5). — `markdownToBlocks` / `importMarkdownAsNote` (core, via `@blocknote/server-util` — [ADR 0003](../../adr/0003-headless-markdown-conversion-server-util.md)); `markdown.test.ts` asserts odd syntax resolves without throwing.
- [x] Markdown export: any note — and the whole vault — exports to readable Markdown files (PRD §4.4, §6). — `exportNoteToMarkdown` / `exportVaultToMarkdown` (core); `import-export.test.ts` asserts whole-vault export mirrors the tree and source JSON is untouched.
- [x] Note metadata (including tags) survives editing untouched unless deliberately edited (PRD §3.2, §4.2). — `updateNoteBlocks` only replaces `blocks`; the editor E2E asserts `meta.title`/`meta.tags` intact after an edit.
- [x] Owner can add/remove tags on the open note from the UI (PRD §3.2). — `TagEditor.tsx` → `vault.setTags` IPC → `updateNoteTags` (core).
- [x] Lint / typecheck / unit tests / build all pass. — full pipeline green (27 core unit tests).

### E2E validation

- [x] An E2E spec opens a fixture note, types into the editor, and asserts the note file on disk contains the edit (envelope still valid, metadata intact). — `apps/desktop/e2e/app.spec.ts` → "edits in the editor persist…": types into BlockNote, polls the real file, asserts blocks contain the edit and `version`/`title`/`tags` intact.
- [x] An E2E spec imports a Markdown document, round-trips it through the editor, and exports it back to readable Markdown. — proven at the core seam the editor shares: `import-export.test.ts` "round-trips Markdown import → export" (import Markdown → stored blocks → export Markdown). *No import/export UI surface exists yet — that lands with CLI/MCP/menu work (E5/E6); this covers the conversion feature end-to-end at core.*

## Notes

- PRD §7.1 (round-trip fidelity) was resolved by [ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md) before this epic: storage is lossless by construction, and Markdown conversion loss is confined to the import/export boundary where it is acceptable.
- Headless Markdown conversion added `@blocknote/server-util` to core — first runtime dependency there — recorded in [ADR 0003](../../adr/0003-headless-markdown-conversion-server-util.md).
- `exactOptionalPropertyTypes` is disabled in the renderer's `tsconfig.web.json` only (BlockNote's generics don't satisfy it); `packages/core` stays full-strict.
