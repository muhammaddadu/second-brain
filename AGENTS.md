# AGENTS.md

Guide for any AI agent (or human) working in this repository. Read this fully, then **read `LEARNINGS.md` before starting work** — it lists mistakes already made here so you don't repeat them. If you make a mistake and correct it, append it to `LEARNINGS.md` (protocol at the bottom of this file).

## Project Overview

**note-agent-second-brain** is a local-first, cross-platform desktop "second brain": a notes vault of BlockNote-JSON note files organised in user-chosen folders and tags (Markdown importable/exportable at every surface — [ADR 0001](docs/adr/0001-blocknote-json-canonical-note-format.md)), edited in a React UI with a [BlockNote](https://www.blocknotejs.org/docs) rich editor (folder tree on the left, rich note view/editor on the right — including first-class diagram rendering (Mermaid, extensible) — right-click file actions). Its defining purpose is **agent access**: any AI agent can read, search, and update the vault via an MCP server or a CLI, following rules the owner defines — e.g. "summarise my last 24 hours, find the best existing docs to insert the updates into, or create new ones." Built-in RAG (full-text + vector search) makes the vault findable for both agents and the human owner. The vault grows over time; nothing leaves the machine by default.

**Stack (proposed — nothing is built yet):** TypeScript throughout. Electron + React + Vite for the desktop app; BlockNote for editing; a shared core library for all vault operations; SQLite (FTS5 + vector embeddings) for the derived search index; a CLI and an MCP server as headless agent surfaces. See [tech-stack](docs/architecture/tech-stack.md) for rationale and alternatives considered.

## Before Building Anything

Consult docs in this order — `docs/README.md` is the index with reading paths:

1. `LEARNINGS.md` — mistakes already made and corrected
2. `docs/product/epics/index.md` — what to build next; **don't build ahead of the current epic**
3. `docs/product/prd.md` — requirements, the source of truth for *what*
4. `docs/architecture/system-architecture.md` and `docs/architecture/data-model.md` — how it's built and stored
5. `docs/guides/getting-started.md` — run it locally (stub until E0 lands)

Domain terms: `docs/glossary.md`.

## Commands

Run from the repo root. Package manager is **pnpm** (`pnpm install` first). Scripts fan out across the workspace with `pnpm -r`.

| Command | What it does |
|---------|--------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Launch the desktop app (electron-vite) with HMR |
| `pnpm lint` | Biome lint + format check (`biome check .`) — `pnpm format` to auto-fix |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Vitest unit tests in every package |
| `pnpm test:e2e` | Desktop Playwright E2E — builds the app, drives real Electron (needs a display) |
| `pnpm build` | Build every package (core → `dist/` via `tsc`; desktop → `out/` via electron-vite) |

Point the app at a scratch vault with `BRAIN_VAULT=/path/to/vault pnpm dev` (otherwise it shows a folder picker).

**Before declaring any change done:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all pass (plus `pnpm test:e2e` when desktop behaviour changed), and the docs cross-links in `docs/README.md` must resolve.

## Repo Layout

Traces to [app-architecture](docs/architecture/app-architecture.md). `packages/core` (E0) and `apps/desktop` (E1) have landed; the rest are planned.

```
AGENTS.md, CLAUDE.md, LEARNINGS.md   # agent guidance (this methodology)
package.json, pnpm-workspace.yaml    # pnpm monorepo root
tsconfig.base.json, biome.json       # shared TS config; Biome lint+format
docs/                # project documentation — routing index at docs/README.md
packages/core/       # (E0 ✓) vault library: note envelope/metadata, tree, mutations, trash — ALL vault I/O lives here
apps/desktop/        # (E1 ✓) Electron + React + Vite shell: main (hosts core), preload (IPC bridge), renderer (React UI)
packages/cli/        # (planned, E5) `brain` CLI — headless agent/human surface
packages/mcp/        # (planned, E6) MCP server exposing vault tools to agents
```

## Architecture Rules (non-negotiable)

- **Files on disk are the single source of truth.** Notes are BlockNote JSON envelopes (metadata + native block document — see [data-model](docs/architecture/data-model.md)) in the user's folder structure; the editor's document is persisted losslessly, per [ADR 0001](docs/adr/0001-blocknote-json-canonical-note-format.md). The search index and embeddings are *derived* and must always be rebuildable from the files; never store a fact only in the index.
- **All surfaces go through `packages/core`.** The desktop app, CLI, and MCP server never touch the filesystem or index directly — one implementation of vault operations, three thin shells.
- **No opaque formats; export is the longevity guarantee.** Note files are documented, deterministically serialized JSON (schema owned by [data-model](docs/architecture/data-model.md)) — never undocumented or binary. Whole-vault Markdown export must always work, so a vault stays usable with the app uninstalled. Every surface accepts Markdown *and* block JSON on write ([ADR 0001](docs/adr/0001-blocknote-json-canonical-note-format.md)).
- **No silent data loss.** Destructive operations (delete, move, overwrite) go to trash or are otherwise recoverable; external edits to open notes must not be clobbered.
- **Local-first, private by default.** Note content never leaves the machine except via an explicitly configured, opt-in embedding provider; the default embedding path is local.

### Adding a vault capability (the most common change)

1. Implement the operation as a pure/testable function in `packages/core` with colocated unit tests.
2. Expose it through each surface that needs it: IPC handler in `apps/desktop`, a subcommand in `packages/cli`, a tool in `packages/mcp`.
3. If it changes what's stored, update [data-model](docs/architecture/data-model.md) in the same change; if it changes agent-facing behaviour, update [agent-integration](docs/guides/agent-integration.md).
4. Tick the matching epic checkbox only when a test proves it.

## Code Standards

- TypeScript strict mode; no `any` — fix the type at the boundary rather than casting across it.
- React function components; state kept close to where it's used; vault state flows from core via IPC, not duplicated in the renderer.
- Named constants over magic numbers; single responsibility per function.
- Tests are colocated unit tests of pure functions (`*.test.ts` next to the module). Extract logic into pure functions to make it testable.

## Engineering Principles (apply to every change)

The standing bar — apply as you write, verify before committing:

- **Separation of concerns / layering.** Each layer depends only on the one below. UI and MCP/CLI handlers stay thin; business logic lives in `packages/core`, not in shells.
- **One source of truth.** A fact (a metadata key, a path convention, a constant, a contract) is defined in exactly one place and imported. Typing the same literal a second time → hoist it.
- **No abstraction leakage.** A lower layer's representation must not surface in a higher one. Don't use `as`/casts to smuggle a type across a boundary — fix the boundary.
- **No duplication — extract the shared function** the first time you'd write it twice.
- **Dependency injection for testability.** Construct dependencies (vault path, index, embedding provider) at a seam and inject them; don't reach for globals/env deep in the code. This is what lets tests run on a temp-dir vault and a fake embedder.
- **Pure functions, unit-tested; thin shells.** Push decisions into pure functions with colocated tests; keep I/O at the edges. Every acceptance criterion should be provable by a test.
- **Update docs in the same change as the code** they describe — stale docs are bugs. Prefer updating existing docs over creating new ones. No placeholder sections.
- Mermaid for diagrams and flows, not ASCII art (exception: ASCII page-layout mockups). "Planned" content must be labelled and trace to the PRD or data model.

## Git Conventions

- Commit messages describe **what is actually in the diff** — check `git status`/`git diff` before writing one.
- Don't commit or push unless asked; never commit secrets/`.env` files.
- Never commit a personal vault's contents into this repo — test fixtures use synthetic notes only.

## Common Pitfalls

None recorded yet — this section is seeded from `LEARNINGS.md` as they accumulate. Known risks to watch (from the PRD's open questions): BlockNote JSON schema churn across versions (the envelope `version` field and migration path exist for this — [ADR 0001](docs/adr/0001-blocknote-json-canonical-note-format.md)), and concurrent writes between the app and headless agent surfaces.

## Learnings Protocol

When a mistake is made and then corrected during development, append an entry to `LEARNINGS.md`:

```markdown
## <short title> (<date>)

**What went wrong:** <brief description>
**Why:** <root cause or misunderstanding>
**Fix / Correct approach:** <what was done; what to do instead next time>
```

`LEARNINGS.md` is append-only — never rewrite or delete entries. Review it at the start of every working session.
