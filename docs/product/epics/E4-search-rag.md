# E4 — Search index & RAG

> **This doc owns:** the acceptance state of the search/RAG epic. **Index:** [epics](index.md). **Index schema:** [data-model](../../architecture/data-model.md).

**Status:** In progress — keyword (FTS) search + ⌘K shipped (2026-07-09); semantic/embeddings and the knowledge graph still to come · **Depends on:** E0 (search UI: E1) · **PRD:** §3.4, §4.1, §4.3, §7.2

## Goal

The retrieval layer that makes the vault findable for humans and agents alike: a derived SQLite index in `packages/core` combining full-text (FTS5) and vector search over note chunks, updated incrementally and always rebuildable from the files. One implementation serves the app's ⌘K search now and the CLI/MCP surfaces in E5/E6. Resolves PRD §7.2 (local embedding model).

## Deliverables

- Index module in core: chunking, FTS5 table, embeddings via a pluggable provider (local default; schema per [data-model](../../architecture/data-model.md)).
- Incremental update on note change + full `rebuild` operation.
- Hybrid query API: keyword + semantic, merged/ranked, returning note paths with snippets.
- In-app ⌘K search UI: type → results → open note.
- **Knowledge-graph view**: an interactive graph of the vault — notes as nodes, edges from semantic similarity (embedding nearest-neighbours, above a tunable threshold) and shared tags. Graph data comes from core (derived from the index, rebuildable); the app renders it (force-directed, zoom/pan, click-to-open, filter by tag, adjust threshold). It reuses the same index as search, so it is a *view* of the RAG, not a second store.
- Decision recorded for PRD §7.2 (embedding model/runtime) in [tech-stack](../../architecture/tech-stack.md); graph rendering library chosen here too (candidates: a canvas/WebGL force-graph — decide for large-vault performance).

## Acceptance criteria

### Functional

- [x] Deleting the index file and running rebuild reproduces equivalent search results — proves the index is fully derived (PRD §3.4, §4.2). — `rebuildIndex` clears + reindexes from files; `search.test.ts` asserts a fresh index over the same files yields identical results.
- [x] Editing a note updates its index entries incrementally without a full rebuild (PRD §3.4). — `reindexNote` is content-hash gated (skips unchanged); the main-process watcher reindexes on change / removes on unlink; unit-tested.
- [ ] A semantic query with no keyword overlap (fixture-designed) returns the intended note; a keyword query returns exact matches (PRD §3.4, §6). — **keyword half done** (FTS5 exact/prefix match, unit-tested); semantic half awaits the embeddings slice.
- [x] Default configuration performs no network calls during indexing or search (PRD §4.1). — FTS indexing/search is fully local (WASM SQLite, no network); embeddings (opt-in, the only network path) are not wired yet.
- [ ] Search over a generated 1000-note fixture vault returns in under 1 second (PRD §4.3). — perf test to add with the 1000-note fixture.
- [x] Lint / typecheck / unit tests / build all pass. — green (52 core + 2 desktop unit; 17 E2E).

### E2E validation

- [x] An E2E spec opens ⌘K in the app, types a query, and opens a result note from a fixture vault. — `app.spec.ts` "⌘K search finds a note by its text and opens it".
- [ ] An E2E spec opens the graph view, and clicking a node opens the corresponding note.

### Knowledge graph

- [ ] Core exposes a graph query — nodes (notes with title/tags) + weighted edges (semantic neighbours ∪ shared-tag links) — derived from the index and rebuildable (PRD §3.4).
- [ ] The graph renders interactively (force layout, zoom/pan); a tag filter and a similarity-threshold control change what's shown; clicking a node opens the note.
- [ ] The graph is derived only — deleting and rebuilding the index reproduces an equivalent graph (no graph data stored outside the index/files).

## Notes

The graph is a visualization of the RAG relationships (semantic + tag), not a separate feature — it shares E4's index. Relation properties from databases ([E8](E8-databases.md)) can later add explicit edges to the same graph.
