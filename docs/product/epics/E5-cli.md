# E5 — CLI surface

> **This doc owns:** the acceptance state of the CLI epic. **Index:** [epics](index.md). **Agent-facing behaviour:** [agent-integration](../../guides/agent-integration.md).

**Status:** Done (2026-07-09) · **Depends on:** E0, E4 · **PRD:** §3.5

## Goal

The first headless agent surface: a `brain` CLI over `packages/core` that lets any agent (or script, or the owner in a terminal) list, read, search, create, and update notes in a vault — with the desktop app closed or open. Proves the "thin shell over core" architecture before the MCP server repeats it, and gives agents without MCP a way in.

## Deliverables

- `packages/cli`: `brain` binary — vault path via flag/env/config; subcommands covering tree/list, read, search, create, update, move, tag, delete (to trash), index rebuild.
- Machine-friendly output (JSON mode) alongside human-readable default.
- CLI usage documented in [agent-integration](../../guides/agent-integration.md) in the same change.

## Acceptance criteria

### Functional

- [x] Every subcommand is a thin call into core — no vault logic in the CLI package (AGENTS.md architecture rule). — `run.ts` commands each call a core function; the CLI package's only deps are `@brain/core` + Node built-ins.
- [x] `search` returns the same results as the in-app search for the same fixture query (PRD §3.5 — identical behaviour across surfaces). — both use core `hybridSearch` / `index.search`; the CLI builds an embedding provider from env (`BRAIN_EMBED*`) for semantic, else keyword — same code path as the app.
- [x] `--json` output is stable and parseable for every read/search subcommand (PRD §3.5). — `read`/`search`/`tree`/`tag`/`rules` emit `JSON.stringify`; `run.test.ts` parses read + tree JSON.
- [x] Writes performed while the desktop app is open appear in the app and do not corrupt notes or index (PRD §3.5, §7.3 decision). — writes use the same core atomic-write + watcher path (ADR 0002); the app's watcher picks them up live.
- [x] Lint / typecheck / unit tests / build all pass. — green (7 CLI tests: arg parser + in-process create→search→update→read + JSON + tags/trash).

### E2E validation

- [x] A shell-level E2E test drives the built binary against a temp fixture vault: create → search finds it → update → read reflects the update. — `cli.e2e.test.ts` spawns the built `brain` binary (`pnpm --filter @brain/cli test:e2e`).

## Notes

`brain` is a thin shell over core: `tree`/`list`, `read`, `search`, `create`, `update`, `move`, `tag`, `trash`, `rules`, `index rebuild`. Vault via `--vault` or `BRAIN_VAULT`; `--json` for machine output. Semantic search is opt-in via `BRAIN_EMBED*` env (local/on-device need no secret — the CLI is plain Node, so hosted keys come from env, not the app keychain). CLI reference: [agent-integration](../../guides/agent-integration.md).
