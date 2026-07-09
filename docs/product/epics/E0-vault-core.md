# E0 — Workspace skeleton & vault core

> **This doc owns:** the acceptance state of the foundation epic. **Index:** [epics](index.md). **Code layout:** [app architecture](../../architecture/app-architecture.md).

**Status:** Done (2026-07-09) · **Depends on:** — · **PRD:** §3.1, §3.2, §4.2

## Goal

Stand up the monorepo and the one library everything else is a shell over: `packages/core`, which owns all vault I/O — reading/writing note envelopes (JSON metadata + BlockNote blocks per [ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md)), listing the folder tree, and safe mutations. It comes first because every surface (app, CLI, MCP) and the index depend on it, and because the test harness it establishes is what keeps every later epic honest.

## Deliverables

- Monorepo workspace (TypeScript strict, lint, typecheck, test, build scripts) — and the real commands recorded in `AGENTS.md` → Commands in the same change.
- `packages/core`: vault open, note read/parse (envelope per [data-model](../../architecture/data-model.md)), note write/serialise (deterministic), folder-tree listing, create/rename/move, delete-to-trash.
- Test harness: temp-dir fixture vault with synthetic notes; colocated unit tests.
- Decision recorded for [PRD §7.3](../prd.md#7-open-questions) (concurrency mechanism) in [system-architecture](../../architecture/system-architecture.md).

## Acceptance criteria

### Functional

- [x] A note file parses to `{version, meta, blocks}` and serialises back byte-identical when unchanged, unknown `meta` keys preserved (PRD §3.1, §4.2). — `parseNote`/`serializeNote` in `packages/core/src/envelope.ts`; proved by the byte-identical + unknown-key round-trip test in `envelope.test.ts`.
- [x] Tree listing returns the folder/note hierarchy of a fixture vault, ignoring the index/config internals (PRD §3.2). — `listTree` in `tree.ts`; `tree.test.ts` asserts the hierarchy and that `.brain/` and `RULES.md` are excluded.
- [x] Create, rename, and move operations produce the expected files; delete moves to trash, not permanent removal (PRD §3.1, §4.2). — `createNote`/`renameNote`/`moveNote`/`trashNote` in `vault.ts`; `vault.test.ts` asserts files on disk and that trash is recoverable (and creates/moves refuse to clobber).
- [x] Tags read from and write to note metadata (PRD §3.2). — `getTags`/`setTags` (`envelope.ts`) + persistence via `writeNote`; covered in `envelope.test.ts` and `vault.test.ts`.
- [x] Lint / typecheck / unit tests / build all pass via the workspace scripts. — `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green (19 tests).

### E2E validation

- [x] A test drives the full life of a note against a temp-dir vault — create → read → edit body and tags → move → delete-to-trash — asserting on the real files on disk at each step. — `lifecycle.e2e.test.ts`, using a monotonic injected clock to prove `updated` advances while `created` is stable.

## Notes

- Concurrency mechanism decided and recorded: [ADR 0002](../../adr/0002-vault-concurrency-atomic-write-rename.md) (atomic write-then-rename + watcher + WAL). The atomic write primitive ships in `packages/core/src/atomic.ts`; the watcher and E3's conflict guard build on it in later epics.
- Tooling fixed in E0 (pnpm / Vitest / Biome / TS strict) recorded in [tech-stack](../../architecture/tech-stack.md#fixed-in-e0-2026-07-09); commands in [AGENTS.md](../../../AGENTS.md#commands).
