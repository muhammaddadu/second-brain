# App Architecture

> **This doc owns:** the code layout — packages, module boundaries, and where logic lives. **For process/system shape see** [system-architecture](system-architecture.md); **for dependency choices see** [tech-stack](tech-stack.md).

**Status: partial** — E0 scaffolded the workspace and `packages/core`; the app and other packages are still planned. Keep this doc in lockstep as packages land.

## Monorepo layout

pnpm workspace monorepo, TypeScript strict throughout (tooling fixed in E0 — see [tech-stack](tech-stack.md)):

```
apps/
  desktop/          # E1 — Electron + React + Vite
    src/main/       #   Electron main process: hosts core, IPC handlers, watcher wiring
    src/preload/    #   typed IPC bridge (contextIsolation on)
    src/renderer/   #   React UI: tree panel, BlockNote editor, ⌘K search
packages/
  core/             # E0/E4 — ALL vault logic: note envelope, tree, mutations, trash,
                    #   Markdown import/export, watcher, index (FTS + vectors), hybrid search
  cli/              # E5 — `brain` binary; subcommand-per-core-operation
  mcp/              # E6 — stdio MCP server; tool-per-core-operation + rules exposure
docs/               # this documentation tree
```

## Boundary rules

The dependency direction is one-way: `apps/desktop`, `packages/cli`, `packages/mcp` → `packages/core` → disk. Concretely:

- **Renderer never touches the filesystem.** All vault operations run in the Electron main process and cross to React via the typed preload/IPC bridge. No `fs`, no SQLite in the renderer.
- **CLI and MCP contain no vault logic** — argument/tool parsing, formatting, and a core call. If a shell needs a loop or a decision about vault content, that belongs in core.
- **Core knows nothing about its shells** — no Electron, CLI, or MCP imports in core; dependencies like the embedding provider are injected ([AGENTS.md](../../AGENTS.md) → Engineering Principles).

## Where things live

| Concern | Home |
|---------|------|
| Note read/write, envelope/metadata, tree, move/trash | `packages/core` (vault module) |
| Markdown ↔ block conversion (import/export, [ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)) | `packages/core` — shells and agents call it, never convert themselves |
| Index, chunking, embeddings, hybrid search | `packages/core` (index module) |
| File watching / external-change events | `packages/core`, consumed by desktop main via IPC events |
| UI state (selection, expanded folders) | renderer only — never persisted as vault truth |

Tests are colocated (`*.test.ts` beside the module) against temp-dir fixture vaults; the desktop E2E harness lands in E1.
