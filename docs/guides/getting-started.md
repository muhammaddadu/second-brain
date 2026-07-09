# Getting Started

> **This doc owns:** running the project locally — prerequisites, install, dev loop. **For what the commands do architecturally see** [app-architecture](../architecture/app-architecture.md); **for the command list see** [AGENTS.md → Commands](../../AGENTS.md#commands).

As of [E3](../product/epics/E3-file-actions.md), the repo is a pnpm monorepo with `@brain/core` (all vault I/O + Markdown import/export + a file watcher) and `@brain/desktop` (the Electron shell — folder tree with a right-click file-actions menu, BlockNote editor with autosave, tag editing, diagrams, live external-change updates and a conflict guard).

## Prerequisites

- **Node ≥ 20** (developed on 24).
- **pnpm** (via `corepack enable`, or install directly). The repo pins `packageManager` in `package.json`.

## Install & verify

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass before any change is done ([AGENTS.md → Commands](../../AGENTS.md#commands)).

## Dev loop

- `pnpm dev` — launches the desktop app with HMR. On first run it shows a folder picker; to skip that, point it at a scratch vault: `BRAIN_VAULT=/path/to/vault pnpm dev`.
- `pnpm test` — one-shot Vitest run across the workspace (core unit tests).
- `pnpm test:e2e` — builds the app and drives real Electron with Playwright (needs a display).
- `pnpm format` — apply Biome formatting fixes.

## Developing against a vault

Core operates on any directory as a vault. Tests never touch a personal vault — they build a throwaway temp-dir vault with synthetic notes via the `createFixtureVault` helper in `packages/core/src/test-support/` (the desktop E2E seeds its own temp vault the same way). For manual runs, make an empty scratch folder and pass it via `BRAIN_VAULT`; **never point tests, fixtures, or `BRAIN_VAULT` at a real vault** ([AGENTS.md → Git Conventions](../../AGENTS.md#git-conventions)).

## What's next

Search & RAG ([E4](../product/epics/E4-search-rag.md)) — the SQLite FTS + vector index and the ⌘K overlay — then the CLI ([E5](../product/epics/E5-cli.md)) and MCP server ([E6](../product/epics/E6-mcp-rules.md)). Orient on build order via the [epics index](../product/epics/index.md).
