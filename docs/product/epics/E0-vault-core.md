# E0 — Workspace skeleton & vault core

> **This doc owns:** the acceptance state of the foundation epic. **Index:** [epics](index.md). **Code layout:** [app architecture](../../architecture/app-architecture.md).

**Status:** Planned · **Depends on:** — · **PRD:** §3.1, §3.2, §4.2

## Goal

Stand up the monorepo and the one library everything else is a shell over: `packages/core`, which owns all vault I/O — reading/writing note envelopes (JSON metadata + BlockNote blocks per [ADR 0001](../../adr/0001-blocknote-json-canonical-note-format.md)), listing the folder tree, and safe mutations. It comes first because every surface (app, CLI, MCP) and the index depend on it, and because the test harness it establishes is what keeps every later epic honest.

## Deliverables

- Monorepo workspace (TypeScript strict, lint, typecheck, test, build scripts) — and the real commands recorded in `AGENTS.md` → Commands in the same change.
- `packages/core`: vault open, note read/parse (envelope per [data-model](../../architecture/data-model.md)), note write/serialise (deterministic), folder-tree listing, create/rename/move, delete-to-trash.
- Test harness: temp-dir fixture vault with synthetic notes; colocated unit tests.
- Decision recorded for [PRD §7.3](../prd.md#7-open-questions) (concurrency mechanism) in [system-architecture](../../architecture/system-architecture.md).

## Acceptance criteria

### Functional

- [ ] A note file parses to `{version, meta, blocks}` and serialises back byte-identical when unchanged, unknown `meta` keys preserved (PRD §3.1, §4.2).
- [ ] Tree listing returns the folder/note hierarchy of a fixture vault, ignoring the index/config internals (PRD §3.2).
- [ ] Create, rename, and move operations produce the expected files; delete moves to trash, not permanent removal (PRD §3.1, §4.2).
- [ ] Tags read from and write to note metadata (PRD §3.2).
- [ ] Lint / typecheck / unit tests / build all pass via the workspace scripts.

### E2E validation

- [ ] A test drives the full life of a note against a temp-dir vault — create → read → edit body and tags → move → delete-to-trash — asserting on the real files on disk at each step.

## Notes

—
