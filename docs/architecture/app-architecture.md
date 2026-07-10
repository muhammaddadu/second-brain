# App Architecture

> **This doc owns:** the code layout — packages, module boundaries, and where logic lives. **For process/system shape see** [system-architecture](system-architecture.md); **for dependency choices see** [tech-stack](tech-stack.md).

**Status: partial** — E0 scaffolded the workspace and `packages/core`; E1 added `apps/desktop` (Electron shell + IPC bridge); E2 added the BlockNote editor with autosave, tag editing, and core's Markdown import/export; E7 added inline Mermaid diagram rendering behind an app-layer renderer registry; E3 added the file-actions context menu, a core file watcher with live tree updates, and the conflict guard; E4 added the derived search index (WASM SQLite FTS + optional semantic embeddings via a pluggable provider) with a ⌘K palette, provider settings, and the knowledge-graph view; E5 added the `brain` CLI; E6 added the `brain-mcp` MCP server (tool registry over core). All planned packages have landed. Keep this doc in lockstep as packages land.

## Monorepo layout

pnpm workspace monorepo, TypeScript strict throughout (tooling fixed in E0 — see [tech-stack](tech-stack.md)):

```
apps/
  desktop/          # E1 — Electron + React + Vite
    src/main/       #   Electron main process: index.ts (shell + IPC) composes config.ts,
                    #   embedding-service.ts, agent-skill.ts, seed-notes.ts
    src/preload/    #   typed IPC bridge (contextIsolation on)
    src/renderer/   #   React UI, grouped by feature: editor/ (BlockNote + diagrams),
                    #   sidebar/ (tree + dnd logic), search/ (⌘K + graph), settings/,
                    #   shell/ (onboarding, switcher), lib/ (shared display helpers)
packages/
  core/             # E0/E4 — ALL vault logic: note envelope, tree, mutations, trash,
                    #   Markdown import/export, watcher, index (FTS + vectors), hybrid search
  cli/              # E5 — `brain` binary; subcommand-per-core-operation
  mcp/              # E6 — stdio MCP server; data-driven tool registry (tools.ts) over core
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
| Index, chunking, embeddings, hybrid search, knowledge graph | `packages/core` (`search.ts`, `graph.ts`) |
| Databases: schema, rows as notes, `meta.properties`, views ([ADR 0004](../adr/0004-databases-as-folders-of-notes-with-schema.md)) | `packages/core` (`database.ts`) |
| Wikilinks: parse/resolve, backlinks, link graph edges ([ADR 0010](../adr/0010-wikilinks-plain-text-with-nondestructive-rendering.md)) | `packages/core` (`wikilinks.ts` pure, `links.ts` I/O) — editor renders them via a non-destructive decoration |
| File import (drop `.md`/`.txt`/`.docx`/`.pdf`) | `packages/core` (`import-file.ts` converter table; lazy mammoth/pdf) |
| File watching / external-change events | `packages/core`, consumed by desktop main via IPC events |
| Agent surfaces (CLI, MCP) | `packages/cli`, `packages/mcp` — thin parse→core→format shells |
| Desktop main (config/secrets, embedding service, agent-skill/CLI install, seed) | `apps/desktop/src/main` — composed from focused modules, thin IPC handlers |
| UI state (selection, expanded folders) | renderer only — never persisted as vault truth |

Tests are colocated (`*.test.ts` beside the module) against temp-dir fixture vaults; the desktop app is driven end-to-end by a Playwright E2E harness (`apps/desktop/e2e`).
