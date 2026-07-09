# E9 — Wikilinks

> **This doc owns:** the acceptance state of the wikilinks epic. **Index:** [epics](index.md). **Storage + resolution:** [data-model](../../architecture/data-model.md) § Wikilinks; **rationale:** [ADR 0010](../../adr/0010-wikilinks-plain-text-with-nondestructive-rendering.md).

**Status:** Done (2026-07-09) · **Depends on:** E2 (editor), E4 (graph) · **PRD:** §3.2 (linking)

## Goal

First-class links between notes, the way owners already write them — `[[People/Robert Kohler]]`. A link renders clickable, navigates to its target, autocompletes as you type `[[`, offers to create a missing target, shows up as a backlink on the target, and joins the knowledge graph. Links are plain text on disk, so agents author them with no schema knowledge and they survive Markdown export.

## Deliverables

- **Core:** pure `parseWikilinks` + `resolveWikilink` (path-then-title); vault-wide `collectVaultLinks` / `getBacklinks` (derived by reading notes); `link` edges folded into `buildGraph`.
- **Desktop:** non-destructive ProseMirror decoration rendering `[[…]]` clickable (resolved vs unresolved); click navigates or (unresolved) creates the note; `[[` autocomplete picker inserting `[[Folder/Note]]`; a "Linked from" backlinks panel on each note.
- **Docs:** [ADR 0010](../../adr/0010-wikilinks-plain-text-with-nondestructive-rendering.md); data-model § Wikilinks; agent-integration note; a seeded People note + example link.

## Acceptance criteria

### Functional

- [x] `[[target]]` renders as a clickable link without altering the stored note (plain text on disk; opening/editing never rewrites it — ADR 0010). — non-destructive decoration; core round-trip tests unaffected.
- [x] Resolution matches an exact vault path first, then a unique filename/title; ambiguous bare names don't resolve (PRD §3.2). — `wikilinks.test.ts`.
- [x] Clicking a resolved link opens the target; clicking an unresolved link creates the note at that path and opens it. — `createNoteFromLink` IPC; E2E covers navigation.
- [x] Typing `[[` suggests notes; selecting inserts `[[Folder/Note]]` as plain text. — `WikilinkOverlay` picker.
- [x] A target note shows its backlinks ("Linked from"), derived from the files and rebuildable. — `getBacklinks`; `links.test.ts`; E2E asserts the backlink + round-trip.
- [x] Wikilinks appear as `link` edges in the knowledge graph, dominating same-pair similarity edges. — `buildGraph` + `graph.test.ts`.
- [x] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [x] An E2E opens a note containing `[[People/Ada Lovelace]]`, clicks the rendered link to navigate to the target, and asserts the source appears under "Linked from" (clicking it returns). — `app.spec.ts` "wikilinks: …".

## Notes

- `[[Note#Heading]]` parses but only the note resolves; sub-note anchors are future work.
- Backlinks/graph recompute by scanning notes; if that gets slow on a large vault, cache outgoing links in the index (the storage decision in ADR 0010 doesn't change).
