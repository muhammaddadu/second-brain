# 0006. Build the derived search index on WASM SQLite (`node-sqlite3-wasm`), not a native binding

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

E4 adds the derived search index ([data-model](../architecture/data-model.md) § Index schema): a single-file SQLite database at `.brain/index.db` with FTS5 full-text search now and vector search later, living in `packages/core` so the desktop app, CLI (E5), and MCP server (E6) all query one implementation. [tech-stack](../architecture/tech-stack.md) proposed "SQLite (FTS5 + vector extension)" but left the *binding* open ("confirm in E4").

Two constraints narrow the binding choice. First, the index runs in the **Electron main process on Node 20** — which does **not** have the built-in `node:sqlite` module (that landed in Node 22). Second, the owner explicitly wants to keep the door open to running this same core against a **cloud sync server** later, so the index engine should be portable to environments (serverless/edge/containers) where compiling a native addon is painful or impossible. That points away from native bindings and toward a WebAssembly build that runs anywhere Node (or a JS runtime) runs, with no `node-gyp`/prebuild matrix.

## Decision Drivers

1. **No native compilation** — no `node-gyp`, no per-platform prebuilt binaries, no Electron ABI-rebuild dance; `pnpm install` just works on every dev machine and CI.
2. **Portable to a future cloud/edge runtime** — the same core module should run in a server/serverless context without a native addon (owner's stated sync-server goal).
3. **FTS5 + file persistence in Node** — must create/read/write a real `.brain/index.db` file and support FTS5 (`MATCH`, `bm25()`, `snippet()`); vector search will be added on top.
4. **One engine for all surfaces** — app main process, CLI, MCP, tests — all Node, one dependency.
5. **Simplicity** — a synchronous, file-backed API keeps incremental reindex and queries straightforward; no manual DB-bytes serialization dance.

## Options Considered

### Option 1: `node-sqlite3-wasm` — SQLite compiled to WASM, Node-targeted, synchronous file I/O (chosen)

A WASM build of SQLite with a synchronous Node API that reads/writes a real file via Node `fs`.

- Good: pure WASM — no native build, installs identically everywhere (drivers 1, 2).
- Good: **probed and confirmed** (2026-07-09, scratch spike): file-backed DB persists across reopen; FTS5 virtual table with `MATCH`, `bm25()` ranking, and `snippet()` all work; SQLite 3.53.3 (drivers 3, 5).
- Good: one dependency serves main/CLI/MCP/tests; synchronous API is simple to orchestrate (drivers 4, 5).
- Bad: ships a ~1 MB `.wasm` and is CommonJS, so ESM core imports it via default-interop, and Electron packaging must keep it external (not bundle the `.wasm`) — a known, handled integration point, verified by E4's E2E.
- Bad: WASM is somewhat slower than a native binding; acceptable for a single-user local vault (perf target: search < 1 s over 1000 notes — an E4 acceptance criterion we verify).

### Option 2: `better-sqlite3` — native, synchronous, fastest

The de-facto native SQLite binding for Node.

- Good: fastest; synchronous; FTS5 included; mature.
- Bad: native addon — needs `node-gyp`/prebuilds and an **Electron ABI rebuild** (`electron-rebuild`), a recurring friction on every Electron/Node bump (driver 1) and a poor fit for a portable cloud runtime (driver 2). Rejected on the owner's explicit WASM preference.

### Option 3: `node:sqlite` (Node built-in)

The standard-library SQLite.

- Bad: only available in Node 22+; Electron 33 bundles Node 20, so it is simply **not present** in our main process (fails driver 3 today). Revisit when Electron ships a Node 22+ runtime.

### Option 4: `sql.js` — SQLite→WASM, in-memory

The most battle-tested WASM SQLite.

- Good: pure WASM, portable (drivers 1, 2); very widely used.
- Bad: **in-memory only** — persistence means exporting the whole DB to bytes and rewriting the file, so every incremental note edit re-serializes the entire index (fights driver 5 and scales poorly); FTS5 is not enabled in the default build. Rejected for the persistence/incremental-update mismatch.

## Decision & Rationale

Chosen: **Option 1, `node-sqlite3-wasm`.**

It is the only option that satisfies drivers 1–3 together: pure WASM (no native build, portable to a cloud runtime) *and* a synchronous, file-backed API with FTS5 that we verified end-to-end before committing. It keeps the index engine identical across the app, CLI, MCP, and any future server, which is the whole point of putting the index in `packages/core`.

- Option 2 rejected because a native addon fails the no-compilation and cloud-portability drivers the owner set — the reason we're choosing WASM at all.
- Option 3 rejected because it doesn't exist in Node 20 / Electron 33; a revisit trigger, not a today option.
- Option 4 rejected because in-memory-only persistence makes incremental reindex re-serialize the whole database and its default build lacks FTS5.

## Consequences

- **Easier:** `pnpm install` needs no toolchain; the same core index runs in the desktop app, headless CLI/MCP, tests, and a future sync server; a synchronous API makes reindex/query code linear and easy to test on a temp-file DB.
- **Harder:** `node-sqlite3-wasm` must be marked **external** in the electron-vite main build (bundling the `.wasm` would break it — the same "don't bundle a Node-native lib into main" lesson as jsdom in E7); core is ESM so the CJS module is imported via default-interop; the WASM adds ~1 MB to the packaged app.
- **Neutral / to watch:** WASM performance — we hold the line with the "< 1 s search over 1000 notes" acceptance test; if a very large vault regresses, revisit. Vector search (E4 slice 2) rides on the same DB (a `chunks`/`embeddings` table + a brute-force or `sqlite-vec`-style nearest-neighbour) — recorded when it lands.
- **Revisit if:** Electron adopts a Node 22+ runtime (then `node:sqlite` becomes a zero-dependency option), or WASM perf proves inadequate at target vault sizes (reconsider `better-sqlite3` with an Electron rebuild step).

## Links

- Index schema it backs: [data-model](../architecture/data-model.md) § Index schema
- Supersedes the open "confirm in E4" note in [tech-stack](../architecture/tech-stack.md)
- Epic: [E4 — Search index & RAG](../product/epics/E4-search-rag.md)
- Concurrency primitive the index writes under: [ADR 0002](0002-vault-concurrency-atomic-write-rename.md)
