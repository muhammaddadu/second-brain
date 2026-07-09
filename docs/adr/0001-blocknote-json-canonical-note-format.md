# 0001. Store notes as BlockNote JSON; Markdown becomes an export/input format

**Status:** accepted
**Date:** 2026-07-07
**Deciders:** Muhammad Dadu (owner)

## Context

The original architecture made plain Markdown + YAML frontmatter the canonical on-disk note format, with BlockNote as the editor on top. BlockNote's own documentation, however, describes its Markdown conversion as intentionally lossy in both directions: import (`tryParseMarkdownToBlocks`) covers only a minimal CommonMark/GFM subset, and export is literally named `blocksToMarkdownLossy` — nested children of non-list blocks are flattened and unsupported styling is dropped. BlockNote recommends its native block JSON (`editor.document`) as the only non-lossy persistence format.

That collides with two of this repo's standing rules: *no silent data loss* and *files on disk are the single source of truth*. Staying Markdown-canonical would force either constraining the editor to the round-trippable block subset (fighting the editor, and every future BlockNote feature) or building detect-and-warn machinery around every save. [PRD §7.1](../product/prd.md#7-open-questions) held this open as "BlockNote↔Markdown round-trip fidelity"; this ADR resolves it by changing the premise.

## Decision Drivers

1. **Zero editor data loss** — what the user creates in the editor must persist exactly; no constrained schemas, no fidelity warnings.
2. **Single source of truth, no sync machinery** — one file per note, nothing derived that can drift.
3. **Agent accessibility** — the product's defining purpose; agents must be able to read and write notes without learning a bespoke schema.
4. **Vault longevity** — the vault must remain usable if the app is abandoned.
5. **Git-friendliness / human readability of raw files** — nice to have, explicitly rank-below the drivers above.

## Options Considered

### Option 1: Markdown canonical (status quo)

Keep `.md` files as the source of truth; constrain BlockNote to the block subset that round-trips, with a fidelity policy for the rest.

- Good: raw vault is human-readable, git-diffable, editable with any text editor, browsable on GitHub.
- Good: agents edit files directly in their native format; zero conversion in core.
- Bad: permanently lossy editing — BlockNote's converter is documented as lossy both ways, so either the editor is capped at Markdown's expressiveness forever, or saves silently/noisily lose structure.
- Bad: every new BlockNote feature triggers a "does this round-trip?" policy decision.

### Option 2: BlockNote JSON canonical, Markdown by export (chosen)

One JSON file per note holding the native BlockNote document (plus a metadata envelope); Markdown is produced on demand (CLI/MCP/UI export) and accepted on write.

- Good: perfect fidelity by construction — persists exactly what BlockNote recommends persisting; PRD §7.1 dissolves rather than needing a policy.
- Good: single file, single source of truth, no sync or cache-invalidation logic.
- Good: agent ergonomics preserved at the API layer — surfaces accept Markdown *or* block JSON on write and can return either on read.
- Bad: the raw vault is no longer pleasantly human-readable or text-editor-editable; git diffs are JSON (mitigated by pretty-printing with stable key order).
- Bad: vault longevity now depends on an export path and a documented schema instead of being inherent to the file format.

### Option 3: JSON canonical + auto-synced `.md` mirror

Core writes a derived Markdown file alongside each JSON note on every save.

- Good: vault stays browsable on GitHub and in text editors at no cost to editor fidelity.
- Bad: two files per note and a de-facto second source of truth — edits made to the mirror must be lossy-imported or ignored, a standing clobber/confusion trap that violates the spirit of "no silent data loss".
- Bad: permanent sync machinery and conflict policy for a convenience feature.

### Option 4: Markdown canonical + JSON sidecar cache

Keep `.md` as truth; store block JSON alongside as a fidelity cache so the editor never loses structure it created.

- Good: preserves every current non-negotiable; editor fidelity restored for app-authored content.
- Bad: cache invalidation on every external edit (which file wins when they disagree?) — the hardest failure mode of options 1 and 3 combined.
- Bad: content expressible in blocks but not Markdown still can't be truthfully represented in the canonical file, so the fidelity problem isn't actually solved.

## Decision & Rationale

Chosen option: **Option 2 — BlockNote JSON canonical, Markdown by export**.

It is the only option that fully satisfies drivers 1 and 2: fidelity is structural, not policed, and there is exactly one file with no sync logic. Driver 3 is satisfied one layer up — all vault I/O already goes through `packages/core`, so the MCP/CLI surfaces accept **both** Markdown (converted via `tryParseMarkdownToBlocks` on write) and raw block JSON, agent's choice; reads can return either. Driver 4 is met by making export a first-class, always-available operation (whole-vault Markdown export) rather than a property of the resting format. Driver 5 is knowingly traded down and mitigated by deterministic pretty-printed JSON.

- Option 1 rejected because it fails driver 1: lossiness is documented behaviour of BlockNote's converter, so Markdown-canonical means either a permanently capped editor or ongoing data-loss policy work.
- Option 3 rejected because it fails driver 2: the mirror is a second source of truth with a built-in clobber trap.
- Option 4 rejected because it combines the worst of 1 and 3: cache-invalidation complexity without actually solving fidelity of the canonical file.

## Consequences

- **Easier:** the full BlockNote block set (and future custom blocks, e.g. E7 diagrams) is usable without fidelity policy; PRD §7.1 is resolved; no round-trip test matrix; external-edit conflict detection operates on one file.
- **Harder:** the vault is no longer directly readable/editable with a text editor — "open with any editor" becomes "export to Markdown at any time"; the note JSON envelope (metadata + version + blocks) must be documented in the data model and kept migratable across BlockNote versions; whole-vault export becomes a supported, tested feature rather than a nicety; indexing/RAG must extract text from blocks instead of parsing Markdown.
- **Neutral / to watch:** git diffs of pretty-printed JSON are workable but noisier than Markdown; BlockNote's document schema stability across major versions becomes a dependency risk to track.
- **Revisit if:** BlockNote's JSON schema churns badly across versions, a successor editor is adopted, or direct text-editor editing of notes becomes a real user requirement rather than a nice-to-have.

## Links

- Resolves: [PRD §7.1](../product/prd.md#7-open-questions)
- Storage format details: [data-model](../architecture/data-model.md)
- Agent read/write formats: [agent-integration](../guides/agent-integration.md)
- BlockNote docs: [Markdown export (lossy)](https://www.blocknotejs.org/docs/features/export/markdown), [Markdown import](https://www.blocknotejs.org/docs/features/import/markdown)
