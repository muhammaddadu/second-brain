# Contributing

Thanks for working on Second Brain. This repo is docs-driven and test-gated — a quick orientation:

## Before you start

- Read **[AGENTS.md](AGENTS.md)** (the canonical guide for humans and AI agents alike) and **[LEARNINGS.md](LEARNINGS.md)** (mistakes already made here — don't repeat them).
- The docs index is **[docs/README.md](docs/README.md)**; architecture decisions live in **[docs/adr/](docs/adr/)**.

## Setup

```sh
pnpm install          # Node 22, pnpm 10
pnpm dev              # launch the desktop app with HMR
BRAIN_VAULT=/path pnpm dev   # point at a scratch vault
```

Monorepo layout: `packages/core` (all vault logic), `apps/desktop` (Electron app), `packages/cli` (`brain`), `packages/mcp` (`brain-mcp`).

## The green-bar gate

Every change must pass, before it's "done":

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Run `pnpm test:e2e` too when desktop behaviour changed. CI runs the same gate plus the Playwright E2E on every PR.

## Conventions

- **All vault logic goes through `packages/core`** — the app, CLI, and MCP are thin shells. Don't touch the filesystem or index from a shell.
- **Files on disk are the source of truth**; the search index is derived and must be rebuildable. No silent data loss — deletes go to trash, external edits aren't clobbered.
- TypeScript strict, no `any`; extract pure functions and colocate `*.test.ts`.
- **A significant/irreversible decision → write an [ADR](docs/adr/)**; update the docs in the *same* change as the code.
- Made and corrected a mistake? Append it to `LEARNINGS.md`.

## Pull requests

- Branch off `main`; keep changes surgical and matched to the surrounding style.
- PRs need a passing CI run and a review from a code owner (see [.github/CODEOWNERS](.github/CODEOWNERS)).
- Describe what's actually in the diff; never commit secrets or a personal vault's contents.

## Releases

Tagging drives releases — see **[docs/guides/building-and-releasing.md](docs/guides/building-and-releasing.md)** (`vX.Y.Z` → production, `vX.Y.Z-beta.N` → beta).
