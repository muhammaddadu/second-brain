# E4 — Search index & RAG

> **This doc owns:** the acceptance state of the search/RAG epic. **Index:** [epics](index.md). **Index schema:** [data-model](../../architecture/data-model.md).

**Status:** Planned · **Depends on:** E0 (search UI: E1) · **PRD:** §3.4, §4.1, §4.3, §7.2

## Goal

The retrieval layer that makes the vault findable for humans and agents alike: a derived SQLite index in `packages/core` combining full-text (FTS5) and vector search over note chunks, updated incrementally and always rebuildable from the files. One implementation serves the app's ⌘K search now and the CLI/MCP surfaces in E5/E6. Resolves PRD §7.2 (local embedding model).

## Deliverables

- Index module in core: chunking, FTS5 table, embeddings via a pluggable provider (local default; schema per [data-model](../../architecture/data-model.md)).
- Incremental update on note change + full `rebuild` operation.
- Hybrid query API: keyword + semantic, merged/ranked, returning note paths with snippets.
- In-app ⌘K search UI: type → results → open note.
- Decision recorded for PRD §7.2 (embedding model/runtime) in [tech-stack](../../architecture/tech-stack.md).

## Acceptance criteria

### Functional

- [ ] Deleting the index file and running rebuild reproduces equivalent search results — proves the index is fully derived (PRD §3.4, §4.2).
- [ ] Editing a note updates its index entries incrementally without a full rebuild (PRD §3.4).
- [ ] A semantic query with no keyword overlap (fixture-designed) returns the intended note; a keyword query returns exact matches (PRD §3.4, §6).
- [ ] Default configuration performs no network calls during indexing or search (PRD §4.1).
- [ ] Search over a generated 1000-note fixture vault returns in under 1 second (PRD §4.3).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] An E2E spec opens ⌘K in the app, types a query, and opens a result note from a fixture vault.

## Notes

—
