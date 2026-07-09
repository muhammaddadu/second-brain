# E8 — Databases

> **This doc owns:** the acceptance state of the databases epic. **Index:** [epics](index.md). **Storage:** [data-model](../../architecture/data-model.md) § Databases; **rationale:** [ADR 0004](../../adr/0004-databases-as-folders-of-notes-with-schema.md).

**Status:** Done (2026-07-09) · **Depends on:** E2 (editor), E3 (file actions) · **PRD:** §3.8

## Goal

Structured databases as a natural view over notes: a folder becomes a database with a typed schema, each note in it is a row, and the right panel shows a table or board instead of a single note. Because a row *is* a note, rich editing, search/RAG, Markdown export, live updates, and agent read/write all work on rows for free — the feature adds views and a schema, not a parallel data system ([ADR 0004](../../adr/0004-databases-as-folders-of-notes-with-schema.md)).

## Deliverables

- **Core:** read/write a `database.json` schema (property definitions with stable ids + saved views); read/write a row's `meta.properties`; a typed `properties` API and validation per property type. The index caches `meta.properties` for fast views.
- **Desktop:** a folder with a `database.json` opens as a **table view** (columns = properties, rows = notes; inline edit of cells) and a **board view** (grouped by a select property); clicking a row opens its note (page). "Turn folder into a database" / "add property" / "add row" actions.
- **Property types v1:** text, number, select, multi-select, date, checkbox, url.
- **Markdown export:** a row exports with its properties as a small header block above the body.

## Acceptance criteria

### Functional

- [x] Marking a folder as a database writes a valid `database.json`; adding/renaming a property updates the schema by stable id without rewriting row files (PRD §3.8). — `database.test.ts` asserts the row file's bytes are untouched across a rename.
- [x] A row's property values persist under `meta.properties` and survive editing the note body untouched (PRD §3.8, §4.2). — unit-tested (value survives a body edit; `null` clears).
- [x] Table view renders columns from the schema and a row per note; editing a cell writes the row note's metadata (PRD §3.8). — `DatabaseView` table with per-type cells; E2E asserts the row file gains the value.
- [x] Board view groups rows by a select property; moving a card changes that property on the row (PRD §3.8). — drag a card between columns; E2E asserts the file flips Todo→Done.
- [x] An agent creates a row via core/CLI (a note with `meta.properties`) and it appears in the table — no bespoke schema knowledge (PRD §3.8, §3.5). — unit test creates a row as a plain note + property write and `listRows` returns it.
- [x] Whole-vault Markdown export renders each row's properties readably above its body (PRD §4.4). — `exportNoteToMarkdown` prepends a `**Name**: value` header block (property names, not ids); unit-tested.
- [x] Deleting the index and rebuilding reproduces equivalent views — property values live in the files (PRD §4.2). — views read the note files directly (`listRows`); nothing view-related is stored in the index at all.
- [x] Lint / typecheck / unit tests / build all pass. — green (86 core unit incl. 6 database; full suites unchanged).

### E2E validation

- [x] An E2E spec creates a database, adds a select property, creates rows, edits a cell in the table, switches to the board view and moves a card — asserting the row note files on disk reflect each change. — `app.spec.ts` "databases: create a database…". (Creation is a first-class "New database" action — a fresh schema-backed folder with inline rename; converting an existing folder stays available to agents via core `createDatabase`.)

## Notes

- Relations (row-to-row links) and rollups are **out of scope for v1** — they need their own design and connect to the E4 knowledge graph; add them only after the table/board basics ship.
- Schema/row drift (a value for a deleted property) is tolerated and cleaned lazily; `database.json` is the schema of record.
