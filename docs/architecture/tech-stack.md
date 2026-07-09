# Tech Stack

> **This doc owns:** dependency and technology choices with their rationale. **For how they compose see** [system-architecture](system-architecture.md) and [app-architecture](app-architecture.md).

**Status: partly adopted** — choices below were proposed at docs time (2026-07-07); those adopted by shipped epics (pnpm/Vitest/Biome/TS in E0, Electron/React/Tailwind/Playwright in E1, BlockNote in E2, chokidar in E3, Mermaid in E7, WASM SQLite index + OpenAI-compatible embeddings in E4) are now in use, while the MCP SDK (E6) remains proposed. Record reversals here with a dated note, don't erase the original rationale.

## Decisions

| Choice | What | Why | Adopted in |
|--------|------|-----|-----------|
| **TypeScript everywhere, strict** | one language across UI, core, CLI, MCP | BlockNote and the MCP SDK are TypeScript; one language keeps core shared, not reimplemented | E0 |
| **Electron** (+ React + Vite) | desktop shell | Node main process natively runs core (fs, SQLite, watcher, embeddings) in-process — the whole app stays one stack. Chief alternative **Tauri** is lighter but splits the codebase into Rust + TS and complicates sharing core with CLI/MCP. Weight cost accepted for a personal tool | E1 |
| **BlockNote** | rich block editor **and note storage format** | user-chosen requirement ([PRD §3.3](../product/prd.md)); its native JSON document is the canonical on-disk format ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)), with its Markdown import/export used at the boundaries. Adopted E2: `@blocknote/react` + `@blocknote/mantine` in the renderer; `@blocknote/server-util` for headless conversion in core ([ADR 0003](../adr/0003-headless-markdown-conversion-server-util.md)) | E2 ✓ |
| **WASM SQLite** (`node-sqlite3-wasm`, FTS5) | derived search index | single-file, zero-server, fits local-first; FTS5 built in. **Resolved E4 to WASM (not a native binding)** so there's no `node-gyp`/Electron-rebuild and the same core runs in a future cloud sync server ([ADR 0006](../adr/0006-wasm-sqlite-for-derived-index.md)); vector search rides on the same DB (semantic slice) | E4 ✓ (keyword) |
| **Embedding providers as adapters** | semantic search | **Resolved E4 ([ADR 0007](../adr/0007-embeddings-provider-config-and-vector-storage.md) → [ADR 0008](../adr/0008-embedding-provider-adapters-and-discovery.md), PRD §7.2):** opt-in (default off = keyword only, no network). One adapter interface backs a **built-in on-device model** (EmbeddingGemma-300M via `@huggingface/transformers`/ONNX, downloaded once then fully offline — the recommended zero-config default), Ollama / LM Studio / OpenAI / custom OpenAI-compatible, and **AWS Bedrock** (`@aws-sdk/client-bedrock-runtime`); all heavy backends are lazy-loaded. Local runtimes are auto-discovered. Secrets in the OS keychain (`safeStorage`). Vectors live in the same SQLite index, brute-force cosine, hybrid-ranked with FTS | E4 ✓ |
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
| **lucide-react** | icon set | consistent, real icons (no Unicode/emoji) across the tree, header, dialogs, and onboarding |
| **Playwright** (`_electron`) | desktop E2E | drives the real built Electron app; the E1 harness every later desktop epic extends |
| **Mermaid** (E7) | diagram renderer | v1 entry in the app-layer language→renderer registry; renders `mermaid` code blocks inline. Adding a diagram language ([PRD §7.4](../product/prd.md#7-open-questions)) is a registry entry, not a storage change |
| **chokidar** (E3) | vault file watcher | reliable cross-platform recursive watching (vs. `fs.watch`'s flaky recursive mode on Linux) behind core's `watchVault` interface; underpins live tree updates and the conflict guard (ADR 0002) |

## Constraints on future additions

Any new dependency must respect the [AGENTS.md](../../AGENTS.md) non-negotiables — in particular: nothing that makes the vault format proprietary, and nothing that sends note content off-machine by default.
