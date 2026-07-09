# Getting Started

> **This doc owns:** running the project locally — prerequisites, install, dev loop. **For what the commands do architecturally see** [app-architecture](../architecture/app-architecture.md); **for the command list see** [AGENTS.md → Commands](../../AGENTS.md#commands).

As of [E0](../product/epics/E0-vault-core.md), the repo is a pnpm monorepo with one package, `@brain/core` (all vault I/O). The desktop app arrives in [E1](../product/epics/E1-desktop-shell.md); until then there is no app to launch — the dev loop is core plus its tests.

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

- `pnpm dev` — runs `@brain/core` tests in watch mode (the current inner loop; the app `dev` server lands in E1).
- `pnpm test` — one-shot Vitest run across the workspace.
- `pnpm format` — apply Biome formatting fixes.

## Developing against a vault

Core operates on any directory as a vault. Tests never touch a personal vault — they build a throwaway temp-dir vault with synthetic notes via the `createFixtureVault` helper in `packages/core/src/test-support/`. Follow that pattern for local experiments; **never point tests or fixtures at a real vault** ([AGENTS.md → Git Conventions](../../AGENTS.md#git-conventions)).

## What's next

Launching the desktop app against a scratch vault is documented here in the same change as [E1](../product/epics/E1-desktop-shell.md). Orient on build order via the [epics index](../product/epics/index.md).
