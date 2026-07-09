# Tech Stack

> **This doc owns:** dependency and technology choices with their rationale. **For how they compose see** [system-architecture](system-architecture.md) and [app-architecture](app-architecture.md).

**Status: proposed** — decided at docs time (2026-07-07) with zero code written; each choice is cheap to revisit until its adopting epic lands. Record reversals here with a dated note, don't erase the original rationale.

## Decisions

| Choice | What | Why | Adopted in |
|--------|------|-----|-----------|
| **TypeScript everywhere, strict** | one language across UI, core, CLI, MCP | BlockNote and the MCP SDK are TypeScript; one language keeps core shared, not reimplemented | E0 |
| **Electron** (+ React + Vite) | desktop shell | Node main process natively runs core (fs, SQLite, watcher, embeddings) in-process — the whole app stays one stack. Chief alternative **Tauri** is lighter but splits the codebase into Rust + TS and complicates sharing core with CLI/MCP. Weight cost accepted for a personal tool | E1 |
| **BlockNote** | rich block editor **and note storage format** | user-chosen requirement ([PRD §3.3](../product/prd.md)); its native JSON document is the canonical on-disk format ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)), with its Markdown import/export used at the boundaries. Adopted E2: `@blocknote/react` + `@blocknote/mantine` in the renderer; `@blocknote/server-util` for headless conversion in core ([ADR 0003](../adr/0003-headless-markdown-conversion-server-util.md)) | E2 ✓ |
| **SQLite** (FTS5 + vector extension) | derived search index | single-file, zero-server, fits local-first; FTS5 built in; vector search via extension (e.g. sqlite-vec — confirm in E4) | E4 |
| **Local embedding model** | semantic search default | privacy default ([PRD §4.1](../product/prd.md)); specific model/runtime is **open — [PRD §7.2](../product/prd.md#7-open-questions)**, decided in E4; provider interface stays pluggable for opt-in remote | E4 |
| **MCP TypeScript SDK** (stdio) | agent surface | official SDK; stdio transport is what Claude Code / desktop clients spawn | E6 |

## Fixed in E0 (2026-07-09)

| Choice | What | Why |
|--------|------|-----|
| **pnpm workspaces** | monorepo package manager | fast, strict, disk-efficient; best-in-class workspace support for a multi-package repo |
| **Vitest** | test runner | TS-native, fast watch, Vite-aligned with the desktop app's future build; colocated `*.test.ts` |
| **Biome** | lint + format (one tool) | single fast binary, near-zero config vs. the ESLint+Prettier pair for a fresh repo |
| **TypeScript strict + NodeNext ESM** | shared `tsconfig.base.json` | strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; ESM throughout |
| **Vault concurrency: atomic write-then-rename + watcher + WAL** | see [ADR 0002](../adr/0002-vault-concurrency-atomic-write-rename.md) | integrity by construction, no coordinator, headless-safe |

## Fixed in E1 (2026-07-09)

| Choice | What | Why |
|--------|------|-----|
| **electron-vite** | Electron build/dev tooling | Vite for main/preload/renderer with HMR and a clean dev loop; packaging (Forge's strength) is out of scope until after E6 |
| **Tailwind CSS v4** (`@tailwindcss/vite`) | renderer styling | fast layout + theme tokens driving light/dark; warm-paper theme in `apps/desktop` ([ux/index.md § Visual design](../ux/index.md)) |
| **React 19** | renderer UI framework | user-chosen requirement ([PRD §3.3](../product/prd.md)); function components, state local to the renderer |
| **Playwright** (`_electron`) | desktop E2E | drives the real built Electron app; the E1 harness every later desktop epic extends |

## Constraints on future additions

Any new dependency must respect the [AGENTS.md](../../AGENTS.md) non-negotiables — in particular: nothing that makes the vault format proprietary, and nothing that sends note content off-machine by default.
