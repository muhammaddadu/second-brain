# E5 — CLI surface

> **This doc owns:** the acceptance state of the CLI epic. **Index:** [epics](index.md). **Agent-facing behaviour:** [agent-integration](../../guides/agent-integration.md).

**Status:** Planned · **Depends on:** E0, E4 · **PRD:** §3.5

## Goal

The first headless agent surface: a `brain` CLI over `packages/core` that lets any agent (or script, or the owner in a terminal) list, read, search, create, and update notes in a vault — with the desktop app closed or open. Proves the "thin shell over core" architecture before the MCP server repeats it, and gives agents without MCP a way in.

## Deliverables

- `packages/cli`: `brain` binary — vault path via flag/env/config; subcommands covering tree/list, read, search, create, update, move, tag, delete (to trash), index rebuild.
- Machine-friendly output (JSON mode) alongside human-readable default.
- CLI usage documented in [agent-integration](../../guides/agent-integration.md) in the same change.

## Acceptance criteria

### Functional

- [ ] Every subcommand is a thin call into core — no vault logic in the CLI package (AGENTS.md architecture rule).
- [ ] `search` returns the same results as the in-app search for the same fixture query (PRD §3.5 — identical behaviour across surfaces).
- [ ] `--json` output is stable and parseable for every read/search subcommand (PRD §3.5).
- [ ] Writes performed while the desktop app is open appear in the app and do not corrupt notes or index (PRD §3.5, §7.3 decision).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] A shell-level E2E test drives the built binary against a temp fixture vault: create → search finds it → update → read reflects the update.

## Notes

—
