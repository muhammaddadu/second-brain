# 0007. Configure embeddings via an OpenAI-compatible provider; store vectors in the same SQLite index

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

E4's keyword (FTS) leg shipped ([ADR 0006](0006-wasm-sqlite-for-derived-index.md)). The semantic leg needs **embeddings**: a vector per chunk so a query can retrieve notes by meaning, not just keywords ([PRD §3.4](../product/prd.md)). Two things must be decided: (1) **how the owner configures which embedding model/runtime to use** — PRD §7.2 left this open, and the owner asked that embeddings be **optional and user-configurable**, following "the standard other tools use"; and (2) **where the vectors live and how nearest-neighbour search runs**, without breaking the non-negotiables (files-first, private-by-default, the index is derived/rebuildable).

Constraints: private by default (no note content leaves the machine unless the owner opts in), local-first, and the same core must serve app/CLI/MCP. The "standard other tools use" for pluggable embeddings is the **OpenAI-compatible `/embeddings` HTTP API** — spoken by OpenAI, and by every common *local* runtime (Ollama, LM Studio, LocalAI, llama.cpp server). One client shape reaches all of them by just changing base URL + model.

## Decision Drivers

1. **Optional + private by default** — a fresh vault does zero embedding and zero network; semantic search is strictly opt-in.
2. **One config that reaches local and remote** — the owner points at a local runtime *or* a hosted API with the same three fields, no bespoke integrations.
3. **Files-first / derived** — vectors are derived from note text; deleting the index and re-running rebuild must reproduce them (given the same provider), and no vector is the sole copy of a fact.
4. **One engine, no new native deps** — reuse the WASM SQLite index (ADR 0006); don't add a native vector DB or a second store.
5. **Good enough retrieval now, room to scale** — correct nearest-neighbour results for a personal vault today, with a clear upgrade path if it gets slow.

## Options Considered

### Config surface

**Chosen: an OpenAI-compatible provider config** — `{ provider: 'off' | 'openai-compatible', baseUrl, model, apiKey? }` in Settings. `off` (default) = keyword only, no network. Otherwise core POSTs `${baseUrl}/embeddings` with `{ model, input }` and reads `data[].embedding`.
- Good: one client reaches Ollama (`http://localhost:11434/v1`, local/private), LM Studio, LocalAI, and OpenAI/other hosted APIs — the owner just changes the URL/model (drivers 1, 2).
- Good: familiar to anyone who has configured an LLM tool; nothing bespoke to learn or for core to special-case per vendor.
- Bad: a hosted base URL sends note text off-machine — mitigated by `off` being the default and the setting stating this plainly.
- *Rejected — bundle a local model (e.g. Transformers.js/ONNX):* zero-config local semantics, but ships tens–hundreds of MB, pins one model, and couples core to a runtime; the owner explicitly wants to choose. Revisit if a bundled default is wanted later — it can be *another* provider behind the same interface.

### Vector storage + search

**Chosen: store vectors in the existing SQLite index (a BLOB per chunk) and do brute-force cosine in core.**
- Good: no new dependency; rides the ADR-0006 WASM engine; vectors sit beside `chunks`, so a note's rows (text + vector) are dropped/rebuilt together and stay derived (drivers 3, 4).
- Good: brute-force cosine over a personal vault (thousands of chunks) is milliseconds and exact — no index-tuning, no recall cliff (driver 5).
- Bad: brute force is O(n) per query; at very large vault sizes it will need an ANN index.
- *Rejected for now — `sqlite-vec` / an ANN extension:* faster at scale, but adds a native/extension dependency (fights ADR 0006's no-native-build) for a scale we don't have yet.

## Decision & Rationale

Configure embeddings through a single **OpenAI-compatible provider** (default `off`), and store vectors as BLOBs in the **existing SQLite index**, searched by **brute-force cosine** merged with FTS into a hybrid ranking.

This satisfies every driver together: opt-in + private by default; one config for local or remote; vectors derived and co-located with the chunks they come from; no new engine or native dependency; and exact nearest-neighbour results at personal-vault scale. The rejected options each trade away a driver the owner set (bundled model removes choice and bloats install; a native vector extension breaks the no-native-build stance) for a benefit (zero-config, scale) we don't yet need.

## Consequences

- **Easier:** semantic search is a Settings change away; local (Ollama) and hosted both work unchanged; hybrid search reuses the one index; CLI/MCP inherit it. Deleting the index and rebuilding re-derives vectors from the files.
- **Harder:** the data model gains an `embeddings` table and Settings gains an embedding config (documented in [data-model](../architecture/data-model.md)); re-indexing now has an async, possibly-slow network step, so indexing surfaces **progress** and must handle provider errors/timeouts without corrupting the index; a model/dimension change means re-embedding (store the model with the vectors so a mismatch triggers rebuild).
- **Neutral / to watch:** brute-force cosine is O(n·d) per query — fine now, revisit with an ANN index (e.g. `sqlite-vec`) if large vaults regress the "<1 s search" target; switching providers/models invalidates existing vectors.
- **Revisit if:** vault size pushes brute-force over the latency budget, or a zero-config bundled local model becomes a priority (add it as another provider behind the same interface).

## Links

- Builds on: [ADR 0006](0006-wasm-sqlite-for-derived-index.md) (the WASM SQLite index)
- Resolves: [PRD §7.2](../product/prd.md#7-open-questions) (local embedding model/runtime)
- Storage + config shape: [data-model](../architecture/data-model.md) § Index schema, § Settings
- Epic: [E4 — Search index & RAG](../product/epics/E4-search-rag.md)
