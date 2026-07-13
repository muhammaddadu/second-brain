# E11 — Multi-hop recall

> **This doc owns:** the acceptance state of multi-hop graph recall. **Index:** [epics](index.md). **API:** core `multiHopRecall` / `recallRelated`; **agent usage:** [agent-integration](../../guides/agent-integration.md). Extracted from [E10](E10-deeper-memory-semantics.md) theme 2.

**Status:** Done (2026-07-13) · **Depends on:** E4 (graph), E6 (MCP), E9 (wikilink edges) · **PRD:** extends §3.4 search / agent findability

## Goal

From a seed note, walk the knowledge graph (wikilinks, shared tags, optional semantic edges) up to N hops and return related notes with the **shortest trail** and edge kinds — one implementation in core, used by CLI, MCP, and the desktop UI.

## Deliverables

- **Core:** pure `multiHopRecall(graph, seed, options)` + vault helper `recallRelated` (builds graph the same way as the graph view, then walks). Colocated unit tests.
- **CLI:** `brain recall <path> [--hops N] [--kinds …] [--limit N] [--json]`
- **MCP:** `recall` tool (same options)
- **Desktop:** IPC `vault.recall` + “Related” panel on the note view (1–2 hops)
- **Docs:** this epic; agent-integration; data-model note; E10 theme 2 marked accepted → E11

## Acceptance criteria

### Functional

- [x] Pure BFS over `GraphData` returns shortest trails with `distance`, `trail`, and `via` edge kinds. — `recall.test.ts`
- [x] Edge-kind filter (`link` / `tag` / `semantic` / `both`); a `both` edge matches tag or semantic filters. — `recall.test.ts`
- [x] Hops default 2, capped at 5; result limit applied. — `recall.test.ts`
- [x] `recallRelated` builds the graph from index + vault wikilinks (same inputs as desktop graph). — `recall.ts`
- [x] CLI `brain recall` and MCP `recall` call core (no duplicated walk logic). — `run.ts`, `tools.ts`; tests in `run.test.ts`, `server.test.ts`
- [x] Desktop note view shows Related notes via IPC. — `RelatedNotes.tsx`
- [x] Lint / typecheck / unit tests / build pass for touched packages.

### E2E validation

- [x] CLI in-process: two notes sharing a tag → `brain recall` returns the neighbour at distance 1. — `run.test.ts`
- [x] MCP: `recall` from a seeded People note returns a shared-tag Journal note. — `server.test.ts`

## Notes

- Derived only — no new on-disk store; rebuilds with the index + note files.
- Prefer `kinds=link,tag` when semantic edges would be noisy; default is all kinds (semantic included when embeddings are configured).
- Marketing may describe multi-hop recall only after this epic ships.
