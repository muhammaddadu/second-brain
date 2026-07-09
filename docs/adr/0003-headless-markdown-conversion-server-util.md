# 0003. Convert Markdown in headless core via @blocknote/server-util

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

[ADR 0001](0001-blocknote-json-canonical-note-format.md) made BlockNote block JSON the canonical note format and Markdown an interchange format at the boundary; [data-model](../architecture/data-model.md) and [AGENTS.md](../../AGENTS.md) require that **`packages/core` owns Markdown ↔ blocks conversion** so every surface (app, CLI, MCP) behaves identically. E2 lands that conversion.

The catch: BlockNote's conversion functions (`tryParseMarkdownToBlocks`, `blocksToMarkdownLossy`) are methods on an editor instance, and the normal editor is React/DOM-bound. But two of core's three consumers are headless (the CLI and the MCP server) and must convert with the desktop app — and any browser — absent. Until now `packages/core` had **zero runtime dependencies**; whatever does this conversion is the first, and it will be a heavy one (BlockNote pulls in the ProseMirror/tiptap stack and a DOM shim). That combination — a hard-to-remove dependency, shared across all surfaces, surprising in a "pure" core — is what this ADR records.

## Decision Drivers

1. **Fidelity with the editor** — headless import/export must produce the *same* blocks the renderer's BlockNote editor produces, or a note imported via CLI would render differently than one imported in the app.
2. **Truly headless** — must run in Node with no DOM/React and with the app closed (CLI/MCP requirement).
3. **One conversion, one home** — core owns it; no surface reimplements or diverges (AGENTS.md non-negotiable).
4. **Maintenance cost** — avoid owning a hand-written Markdown↔block mapping that must chase BlockNote's evolving block schema.

## Options Considered

### Option 1: `@blocknote/server-util` (chosen)

BlockNote's official server-side package exposes `ServerBlockNoteEditor` — the same conversion engine without a DOM — for use in Node.

- Good: identical conversion to the editor by construction (driver 1) — same library, same block schema.
- Good: runs headless in Node, verified with a probe before adoption (driver 2).
- Good: keeps conversion in core with no reimplementation (drivers 3, 4).
- Bad: adds a large dependency tree (ProseMirror/tiptap + a DOM shim) to a previously dependency-free core, growing install size and the surface for upstream breakage.
- Bad: couples core's conversion to BlockNote's release cadence — a major BlockNote bump can touch core, not just the renderer.

### Option 2: A standalone Markdown library (remark/unified) + hand-written block mapping

Convert with a general Markdown toolchain and map to/from BlockNote's block shape ourselves.

- Good: lighter, well-understood dependencies; no DOM shim.
- Bad: fails driver 1 — our mapping would inevitably drift from BlockNote's actual parser/serializer, so app-authored and CLI-authored notes diverge.
- Bad: fails driver 4 — we would own and continuously maintain a mapping for every current and future block type.

### Option 3: Conversion only in the renderer, headless surfaces skip Markdown

Do conversion where a real editor already exists; CLI/MCP accept block JSON only.

- Good: no new core dependency.
- Bad: fails drivers 2 and 3 outright — agents (the product's defining purpose) could not read/write Markdown headlessly, and conversion would no longer live in core.

## Decision & Rationale

Chosen option: **Option 1 — `@blocknote/server-util`**. It is the only option that satisfies drivers 1–3 together: it *is* BlockNote's engine, so headless conversion matches the editor exactly, runs in Node, and stays in core as a thin wrapper (`packages/core/src/markdown.ts`). The dependency weight (the one real cost) is accepted for a local desktop tool where install size is not a constraint, and was de-risked with a working headless probe before committing.

- Option 2 rejected because it fails driver 1 (fidelity drift) and driver 4 (perpetual mapping maintenance).
- Option 3 rejected because it fails drivers 2–3 — it strands headless agents without Markdown and moves conversion out of core.

## Consequences

- **Easier:** CLI/MCP get Markdown import/export for free from the same core function; whole-vault Markdown export ([PRD §4.4](../product/prd.md)) is a straightforward core operation; the editor and headless surfaces can never disagree on conversion.
- **Harder:** `packages/core` is no longer dependency-free — its build/install now carries the BlockNote/ProseMirror stack, and a major BlockNote upgrade must be validated against core, not just the renderer; the block schema used by `ServerBlockNoteEditor` must stay aligned with the renderer's editor schema (both default today).
- **Neutral / to watch:** conversion is intentionally lossy (BlockNote's definition) — acceptable because it never touches the stored JSON; if BlockNote's server package lags a core release or drops headless support, this decision must be revisited.
- **Revisit if:** `@blocknote/server-util` stops supporting headless Node use, the dependency weight becomes a real problem (e.g. a future non-desktop surface), or the editor adopts a custom block schema that the default server editor can't mirror.

## Links

- Depends on: [ADR 0001](0001-blocknote-json-canonical-note-format.md) (why JSON is canonical and Markdown is a boundary format)
- Mechanism: `packages/core/src/markdown.ts`, `packages/core/src/import-export.ts`
- Format/boundary spec: [data-model](../architecture/data-model.md) § "Markdown import/export"
- Adopted in: [E2](../product/epics/E2-blocknote-editor.md)
