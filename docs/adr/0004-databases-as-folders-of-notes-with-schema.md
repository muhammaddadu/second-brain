# 0004. Model databases as a folder of notes plus a schema descriptor, with row values in note metadata

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

The product should offer structured **databases** — collections of entries with typed properties (text, number, select, date, checkbox, …), viewed as a table or board — without overcomplicating the experience or breaking the architecture's non-negotiables ([AGENTS.md](../../AGENTS.md)): files on disk are the single source of truth, no opaque/undocumented formats, whole-vault Markdown export must keep working, and agents must read/write everything through `packages/core` without learning a bespoke schema. A database is fundamentally "a set of pages, each with structured fields." The question is how to store that so it stays plain files, stays agent-friendly, and reuses what already exists (the note envelope, which already has a `meta` object with preserved unknown keys) rather than inventing a parallel data system.

This ADR settles storage only; views, the editor surface, and query/rollups are the E8 epic's UI/logic built on top.

## Decision Drivers

1. **Files-first, no opaque format** — a database and its rows must be documented, deterministically serialized files, browsable and git-diffable, never a single binary/DB blob.
2. **Reuse the note model** — a database row is conceptually a page; it should *be* a note, so the editor, search, Markdown export, watcher, and agent tools all work on rows for free.
3. **Agent-friendly** — an agent should add or update a row using the same note tools + documented property keys, no special API.
4. **Clean UX, not a second system** — databases should feel like a natural view over notes, not a bolted-on module.
5. **Longevity** — export and "app uninstalled" must still yield readable content.

## Options Considered

### Option 1: A folder is a database; a `database.json` descriptor defines the schema; each row is a note whose `meta.properties` holds its values (chosen)

A folder becomes a database when it contains a `database.json` (documented, deterministic: property definitions `{id, name, type, options?}` + saved views). Every `.note.json` in that folder is a row; its typed values live under `meta.properties` (keyed by property id), alongside the existing `meta` (title/tags/timestamps). The note body is the page content.

- Good: rows are ordinary notes — editor, search/RAG, watcher, Markdown export, and all agent/CLI/MCP tools work on them unchanged (drivers 2, 3). `meta` already preserves unknown keys, so `meta.properties` needs no envelope change.
- Good: everything is documented JSON files in a normal folder — git-diffable, browsable, exportable (drivers 1, 5).
- Good: the schema is one small file per database; adding a database is dropping in a `database.json` (driver 4).
- Bad: property values in per-row files mean a table view must read many files to render (mitigated by the derived index caching properties); renaming a property requires touching rows or an id-indirection (we use stable ids to avoid mass rewrites).
- Bad: two artifacts define a database (the folder's notes + `database.json`); they can drift (a row with a value for a since-deleted property) — tolerated by treating `database.json` as the schema of record and ignoring orphan values.

### Option 2: One file holds the whole database (rows as an array)

A single `foo.database.json` with an array of row objects and the schema.

- Good: one file, trivially consistent; fast to render a table.
- Bad: fails driver 2 — rows are no longer notes, so the editor/search/export/agent tools don't apply to them without a parallel implementation; a "page body" for a row becomes a nested blob.
- Bad: one giant file churns on every edit (poor git diffs, watcher/atomic-write contention), and doesn't scale to large databases.

### Option 3: A sidecar SQLite table / the derived index as the store

Keep rows in the SQLite index as the authority.

- Bad: fails driver 1 outright — the index is derived and disposable; storing database truth there violates "never store a fact only in the index."

## Decision & Rationale

Chosen: **Option 1** — database = folder + `database.json` schema; rows = notes with values in `meta.properties`.

It is the only option that satisfies drivers 1–3 together: it is plain documented files, and — crucially — it makes a row *a note*, so the entire existing stack (editor, hybrid search, Markdown export, watcher, and the agent surfaces) operates on database rows with zero new plumbing. The derived index caches `meta.properties` so table/board views render without reading every file on each paint, keeping the UX responsive (driver 4) while the files stay the source of truth.

- Option 2 rejected because it stops rows from being notes (fails driver 2) and centralizes churn into one file.
- Option 3 rejected because it puts authoritative data in the derived index (fails driver 1).

## Consequences

- **Easier:** databases inherit search/RAG, export, live updates, and agent read/write for free; an agent files a row by creating a note with `meta.properties`; a note can be moved into/out of a database folder and simply gains/sheds its row-ness.
- **Harder:** the data model gains `meta.properties` and a `database.json` schema (both must be documented in [data-model](../architecture/data-model.md) and versioned/migratable); property definitions use **stable ids** (not names) so renames don't rewrite rows; the index must cache properties for fast views; Markdown export must decide how to render properties (frontmatter-style block) — an E8 detail.
- **Neutral / to watch:** schema/row drift (values for deleted properties) is tolerated and cleaned lazily; nested/relation property types (row-to-row links) are deferred — they touch the same link graph as the RAG graph and need their own design.
- **Revisit if:** table rendering over many per-row files proves too slow even with the index cache, or relations/rollups demand a materialized store.

## Links

- Storage details to document: [data-model](../architecture/data-model.md) § Databases (planned)
- Requirement: [PRD §3.8](../product/prd.md) (planned)
- Epic: [E8 — Databases](../product/epics/E8-databases.md)
- Builds on the note envelope: [ADR 0001](0001-blocknote-json-canonical-note-format.md)
