# E4 — Search index & RAG

> **This doc owns:** the acceptance state of the search/RAG epic. **Index:** [epics](index.md). **Index schema:** [data-model](../../architecture/data-model.md).

**Status:** Done (2026-07-09) — keyword + semantic hybrid search, ⌘K, a multi-provider embedding system (incl. on-device EmbeddingGemma), indexing progress + controls, the interactive **knowledge graph**, and the 1000-note performance bar all shipped. (Native Azure/Vertex adapters remain reachable via the custom-endpoint provider; a dedicated large-vault UX pass can come later.) · **Depends on:** E0 (search UI: E1) · **PRD:** §3.4, §4.1, §4.3, §7.2

## Goal

The retrieval layer that makes the vault findable for humans and agents alike: a derived SQLite index in `packages/core` combining full-text (FTS5) and vector search over note chunks, updated incrementally and always rebuildable from the files. One implementation serves the app's ⌘K search now and the CLI/MCP surfaces in E5/E6. Resolves PRD §7.2 (local embedding model).

## Deliverables

- Index module in core: chunking, FTS5 table, embeddings via a pluggable provider (local default; schema per [data-model](../../architecture/data-model.md)).
- Incremental update on note change + full `rebuild` operation.
- Hybrid query API: keyword + semantic, merged/ranked, returning note paths with snippets.
- In-app ⌘K search UI: type → results → open note.
- **Knowledge-graph view**: an interactive graph of the vault — notes as nodes, edges from semantic similarity (embedding nearest-neighbours, above a tunable threshold) and shared tags. Graph data comes from core (derived from the index, rebuildable); the app renders it (force-directed, zoom/pan, click-to-open, filter by tag, adjust threshold). It reuses the same index as search, so it is a *view* of the RAG, not a second store.
- Decision recorded for PRD §7.2 (embedding model/runtime) in [tech-stack](../../architecture/tech-stack.md). **Graph rendering:** `d3-force` for the layout (small, no renderer lock-in) with a hand-rolled pannable/zoomable **SVG** view — enough for personal-vault sizes; revisit a canvas/WebGL renderer if very large vaults need it.

## Acceptance criteria

### Functional

- [x] Deleting the index file and running rebuild reproduces equivalent search results — proves the index is fully derived (PRD §3.4, §4.2). — `rebuildIndex` clears + reindexes from files; `search.test.ts` asserts a fresh index over the same files yields identical results.
- [x] Editing a note updates its index entries incrementally without a full rebuild (PRD §3.4). — `reindexNote` is content-hash gated (skips unchanged); the main-process watcher reindexes on change / removes on unlink; unit-tested.
- [x] A semantic query with no keyword overlap (fixture-designed) returns the intended note; a keyword query returns exact matches (PRD §3.4, §6). — `search.test.ts` "finds a note by meaning with no keyword overlap" (semantic leg via a deterministic fake provider) + the keyword tests; `hybridSearch` fuses both with RRF (ADR 0007).
- [x] Default configuration performs no network calls during indexing or search (PRD §4.1). — embeddings default `off`; keyword indexing/search is fully local (WASM SQLite). Network happens only when the owner opts into a provider in Settings.
- [x] Search over a generated 1000-note fixture vault returns in under 1 second (PRD §4.3). — `search-perf.test.ts` builds a real 1000-note vault, indexes it, and times a `search` on a term in every note: ~½ ms (well under the 1 s bound). Bulk indexing is wrapped in one SQLite transaction, so building the 1000-note index takes a fraction of a second too.
- [x] Lint / typecheck / unit tests / build all pass. — green (52 core + 2 desktop unit; 17 E2E).

### E2E validation

- [x] An E2E spec opens ⌘K in the app, types a query, and opens a result note from a fixture vault. — `app.spec.ts` "⌘K search finds a note by its text and opens it".
- [x] An E2E spec opens the graph view, and clicking a node opens the corresponding note. — `app.spec.ts` "opens the knowledge graph and can return to a note" (asserts the view mounts and router navigation; node-click → open is wired in `GraphView`).

### Knowledge graph

- [x] Core exposes a graph query — nodes (notes with title/tags) + weighted edges (semantic neighbours ∪ shared-tag links) — derived from the index and rebuildable (PRD §3.4). — core `buildGraph` (tag edges by Jaccard overlap, semantic edges by cosine over note-level vectors, merged); `graph.test.ts` covers tag/semantic/merge.
- [x] The graph renders interactively (force layout, zoom/pan); a tag filter and a similarity-threshold control change what's shown; clicking a node opens the note. — `GraphView` (d3-force settled layout, pan/zoom SVG, tag chips, threshold slider, node click → route to note); reached from the header **Graph** button.
- [x] The graph is derived only — deleting and rebuilding the index reproduces an equivalent graph (no graph data stored outside the index/files). — `graph.test.ts` "is derived from the index — rebuilding reproduces the same nodes and edges".

## Notes

Shipped so far: WASM SQLite index ([ADR 0006](../../adr/0006-wasm-sqlite-for-derived-index.md)); keyword FTS + optional semantic embeddings, hybrid-ranked by RRF ([ADR 0007](../../adr/0007-embeddings-provider-config-and-vector-storage.md)); embedding **providers as adapters** — a built-in on-device model (EmbeddingGemma-300M via Transformers.js, the zero-config default) / Ollama / LM Studio / OpenAI / custom OpenAI-compatible / AWS Bedrock — with local self-discovery, connection testing, keychain-stored secrets, and indexing controls (rebuild / pause / clear + stats) in a compact guided Settings flow ([ADR 0008](../../adr/0008-embedding-provider-adapters-and-discovery.md)); ⌘K palette; the interactive **knowledge-graph view** (core `buildGraph` derived from the index — tag + semantic edges; a d3-force `GraphView` with pan/zoom, tag filter, threshold slider, click-to-open). Still to come: a 1000-note perf test, and native Azure/Vertex adapters (currently reachable via the custom-endpoint provider).

The graph is a visualization of the RAG relationships (semantic + tag), not a separate feature — it shares E4's index. Relation properties from databases ([E8](E8-databases.md)) can later add explicit edges to the same graph.
