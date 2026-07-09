# 0002. Coordinate concurrent vault writes with atomic write-then-rename + watcher, not locking or a daemon

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

The vault is written by more than one process. The desktop app (Electron main process hosting `packages/core`) and one or more headless agent surfaces (the `brain` CLI, the MCP server) can each open the same vault and mutate the same files — and, by design ([system-architecture](../architecture/system-architecture.md) → Headless-capable), the agent surfaces run while the app is closed *and* while it is open. Three things can go wrong when two writers overlap: a reader can observe a half-written note file (torn write → corrupt JSON); one writer's save can silently overwrite another writer's concurrent edit (lost update); and the derived SQLite index (`.brain/index.db`) can be corrupted or block on concurrent access from multiple processes.

[PRD §7.3](../product/prd.md#7-open-questions) held the coordination mechanism open, and [system-architecture](../architecture/system-architecture.md) recorded it as a decision to be made in E0. E0 needs it now because `packages/core`'s write path — the one place all surfaces funnel through — has to pick a durability strategy before any surface writes a file. This ADR settles the *mechanism*; the *policy* for what to do when a conflict is detected (surface both versions, never clobber) is E3's conflict guard and builds on top of the primitive chosen here.

## Decision Drivers

1. **No corrupted notes** — a reader must never see a partially written file; a note is either its old bytes or its new bytes, never a splice. Non-negotiable ([AGENTS.md](../../AGENTS.md) → no silent data loss).
2. **No silent lost updates** — if two processes edit the same note concurrently, the mechanism must make that detectable so E3 can refuse to clobber. Losing one edit with no trace is the worst outcome.
3. **Headless works with the app closed** — agents operate on the vault as an equal peer, not as a client of the desktop app. Any mechanism that requires the app to be running is disqualified.
4. **Simplicity / fits files-first** — the vault is plain files as the source of truth; the coordination layer should add as little standing machinery, lifecycle, and failure surface as possible.
5. **Safe concurrent SQLite** — multiple processes reading/writing the derived index must not corrupt it or serialize into long blocks.

## Options Considered

### Option 1: Atomic write-then-rename + watcher-driven refresh, SQLite in WAL (chosen)

Every note write goes to a temp file in the same directory, is `fsync`'d, then `rename`'d over the target — `rename` within a filesystem is atomic, so a reader sees only old or new bytes. Each surface runs a filesystem watcher and refreshes its in-memory view (and reindexes) when files change underneath it. The SQLite index runs in WAL mode so multiple processes read concurrently and writers don't block readers. Lost-update *detection* rides on recorded mtime/content-hash (E3's conflict guard reads these).

- Good: torn-write impossible by construction (driver 1) with no lock lifecycle to manage.
- Good: every process is a symmetric peer — no coordinator, so headless-with-app-closed is automatic (driver 3), and it is the minimal machinery over plain files (driver 4).
- Good: WAL is the standard, well-worn answer for multi-process SQLite (driver 5).
- Bad: atomic rename alone does **not** prevent lost updates — it guarantees integrity of *a* write, not that concurrent writes both survive; driver 2 is only met once E3 layers mtime/hash compare-and-swap on top. This ADR provides the primitive, not the full guard.
- Bad: watcher-driven refresh is eventually-consistent — there is a brief window where a process's in-memory view is stale until the watcher fires; correctness therefore depends on re-checking on write, not on the cached view.

### Option 2: Advisory file locking

Acquire a lock (lockfile or OS advisory lock) per note or per vault before writing, release after.

- Good: turns concurrent writes into a queue, so lost updates are prevented at the moment of writing rather than detected after.
- Good: a familiar model; conceptually simple to state.
- Bad: advisory locks are exactly that — a process that doesn't honour the protocol (an external editor, a crashed run) writes anyway, so the guarantee is only as good as universal cooperation.
- Bad: stale-lock recovery is a genuine failure surface — a process that dies holding a lock must be detected and its lock reclaimed, which reintroduces liveness/timeout logic (driver 4).
- Bad: still needs atomic write for torn-write safety, so it is *additive* to Option 1's mechanism, not a replacement for it.

### Option 3: Single-writer daemon

A long-lived process owns all writes; the app, CLI, and MCP server send mutations to it over IPC.

- Good: writes are trivially serialized in one place — the cleanest possible lost-update story, and a natural home for the index.
- Good: one writer means one cache to keep warm, no cross-process refresh problem.
- Bad: directly violates driver 3 — an agent invoking the CLI with the app (and thus the daemon) not running either fails or must silently spawn the daemon, turning a "plain files" tool into a service with a lifecycle.
- Bad: heaviest option by far (driver 4) — daemon supervision, startup/shutdown, crash recovery, a wire protocol — for a single-user local tool.

## Decision & Rationale

Chosen option: **Option 1 — atomic write-then-rename + watcher-driven refresh, SQLite in WAL**, with lost-update *detection* (mtime/content-hash) recorded on write so E3's conflict guard can build the never-clobber policy on top.

It is the only option that satisfies drivers 1, 3, 4, and 5 simultaneously and with the least standing machinery: integrity is structural (atomic rename), every surface is a symmetric peer so headless-with-app-closed is free, WAL is the boring correct answer for the index, and there is no coordinator or lock lifecycle to own. Driver 2 is met in two layers — this ADR guarantees each individual write is intact and records the metadata (mtime/hash) that makes a concurrent edit *detectable*; E3 turns that into a compare-and-swap that refuses to overwrite a note that changed since it was read.

- Option 2 rejected because it fails driver 4 without buying enough: it needs atomic writes anyway (so it is additive, not alternative), its stale-lock recovery is a real liveness burden, and as advisory-only it cannot bind an external editor — the very case E3 must handle regardless. Compare-and-swap on hash gives the lost-update *detection* we actually need without a lock lifecycle.
- Option 3 rejected because it fails driver 3 outright — it makes headless agent use depend on a running service — and is the heaviest option (driver 4) for a single-user local app.

## Consequences

- **Easier:** core's write path is one well-understood primitive (temp-write → fsync → rename) reused by every surface; the index gets standard multi-process WAL access; headless surfaces need no awareness of whether the app is running.
- **Harder:** every write must be preceded by a freshness re-check against recorded mtime/hash (a cached in-memory view is not authority) — a discipline core must enforce at the write seam so E3 can rely on it; watcher wiring and debounce must exist on every surface that keeps state (desktop main, and any long-lived index); temp files must be written in the same directory as their target so `rename` stays within one filesystem (cross-device rename is not atomic).
- **Neutral / to watch:** watcher-driven refresh is eventually-consistent, so UI/agents can briefly act on a stale view — acceptable because writes re-check, but a source of subtle bugs if a caller trusts the cache; WAL leaves `-wal`/`-shm` sidecar files beside `index.db` (already inside the disposable `.brain/`, so harmless).
- **Revisit if:** a real multi-writer contention problem shows up in practice that compare-and-swap retries can't absorb, or a future networked/sync feature (explicitly out of scope in [PRD §5](../product/prd.md#5-out-of-scope-v1)) changes the peers-on-one-filesystem assumption this decision rests on.

## Links

- Resolves: [PRD §7.3](../product/prd.md#7-open-questions)
- Mechanism recorded in: [system-architecture](../architecture/system-architecture.md) → Concurrency
- Conflict-detection *policy* built on this primitive: [E3 — File actions & live vault updates](../product/epics/E3-file-actions.md)
- Index access mode: [data-model](../architecture/data-model.md) → Index schema (WAL)
