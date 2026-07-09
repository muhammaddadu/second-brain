# E2 — BlockNote editing & Markdown import/export

> **This doc owns:** the acceptance state of the editor epic. **Index:** [epics](index.md). **Storage format:** [data-model](../../architecture/data-model.md); **format rationale:** [ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md).

**Status:** Planned · **Depends on:** E1 · **PRD:** §3.3, §6

## Goal

Replace the read-only note view with a [BlockNote](https://www.blocknotejs.org/docs) editor: load the note's blocks straight from the envelope, edit richly, persist back losslessly ([ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md) — no conversion in the save path). This epic also lands core's Markdown **import/export** boundary, since the editor's paste/import and the vault's export escape hatch (PRD §4.4) share it.

## Deliverables

- BlockNote editor wired into the right panel; load on select, save on edit (autosave with debounce), blocks persisted natively per [data-model](../../architecture/data-model.md).
- Markdown import/export in `packages/core` (`tryParseMarkdownToBlocks` / `blocksToMarkdownLossy` at the seam): single-note and whole-vault export, Markdown accepted on write.
- Tag editing surfaced in the UI (metadata-backed).

## Acceptance criteria

### Functional

- [ ] Selecting a note loads its blocks into BlockNote; edits persist to the note file with no structural loss (PRD §3.3).
- [ ] Fidelity test suite: for every block type, save → reload → save produces a byte-identical file; blocks untouched by an edit are byte-identical after save (PRD §6, §4.2).
- [ ] Markdown import: a Markdown string becomes a valid note via core; unrecognised syntax degrades to plain text, never an error (PRD §3.5).
- [ ] Markdown export: any note — and the whole vault — exports to readable Markdown files (PRD §4.4, §6).
- [ ] Note metadata (including tags) survives editing untouched unless deliberately edited (PRD §3.2, §4.2).
- [ ] Owner can add/remove tags on the open note from the UI (PRD §3.2).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] An E2E spec opens a fixture note, types into the editor, and asserts the note file on disk contains the edit (envelope still valid, metadata intact).
- [ ] An E2E spec imports a Markdown document, round-trips it through the editor, and exports it back to readable Markdown.

## Notes

PRD §7.1 (round-trip fidelity) was resolved by [ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md) before this epic: storage is lossless by construction, and Markdown conversion loss is confined to the import/export boundary where it is acceptable.
