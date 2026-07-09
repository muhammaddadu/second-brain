# E7 — Diagrams as first-class blocks

> **This doc owns:** the acceptance state of the diagrams epic. **Index:** [epics](index.md). **Storage format:** [data-model](../../architecture/data-model.md); **interaction spec:** [UX hub](../../ux/index.md).

**Status:** Done (2026-07-09) · **Depends on:** E2 · **PRD:** §3.7, §6, §7.4

## Goal

Make diagrams first-class citizens of a note: a code block tagged `mermaid` — whether typed by the owner or written by an agent (as Markdown through core's import, or as block JSON) — renders as a live diagram in the editor, is editable as source with live re-render, and survives editing byte-intact. Builds directly on E2's editor via a custom BlockNote block, behind a language-tag → renderer registry so further text-based diagram languages ([PRD §7.4](../prd.md#7-open-questions)) are additions, not redesigns.

## Deliverables

- Custom BlockNote diagram block: code blocks with a registered language tag render as diagrams; source/preview editing per the [UX spec](../../ux/index.md).
- Mermaid renderer as the v1 registry entry; render errors shown alongside intact source.
- Renderer registry seam in the app layer — adding a language touches no storage code ([data-model](../../architecture/data-model.md) → Diagrams).
- Diagram-block coverage added to E2's fidelity suite (byte-identical persistence) and Markdown import/export mapping (fenced block ↔ diagram block).

## Acceptance criteria

### Functional

- [x] A code block tagged `mermaid` in a note renders as a diagram in the editor (PRD §3.7). — custom `codeBlock` override in `editorSchema.tsx` renders `DiagramView` for registered languages; E2E asserts an `<svg>` in the preview.
- [x] The owner can edit a diagram's source in-app and the rendered diagram updates; saving persists the source text losslessly in the note file (PRD §3.7). — source is the block's editable inline content; `DiagramView` re-renders on change; E2E types into the source and asserts the file's `codeBlock` text updated.
- [x] Importing Markdown with a ` ```mermaid ` fenced block produces a diagram block; exporting produces the fenced block back (PRD §3.7). — core seam (`@blocknote/server-util`): `markdown.test.ts` asserts fence → `codeBlock(language:mermaid)` → fence.
- [x] Invalid Mermaid source shows the render error with the source intact and editable — content is never destroyed or hidden (PRD §3.7). — `mermaidRenderer` returns an error result (never throws), `DiagramView` shows `diagram-error`; E2E asserts the error is visible and the source text remains.
- [x] A code block with an unregistered language tag renders as an ordinary code block, never dropped (PRD §3.7). — override falls back to a plain `<pre><code>` when no renderer is registered; E2E asserts a `python` block shows its code and no diagram.
- [x] A diagram block untouched during an editing session survives byte-identical on disk (PRD §4.2, §6). — diagrams are stored as ordinary code blocks (verbatim); `fidelity.test.ts` round-trips a `mermaid` code block byte-identically.
- [x] Registering a second (test/dummy) renderer requires only a registry entry — proves the extensibility seam (PRD §3.7). — `registry.test.ts` registers a `dummy` renderer and looks it up; no storage/schema code changes.
- [x] Lint / typecheck / unit tests / build all pass. — full pipeline green (30 unit tests: 28 core + 2 desktop).

### E2E validation

- [x] An E2E spec adds a Mermaid diagram to a note agent-style (Markdown through core's import, no schema knowledge), asserts the app renders it as a diagram, then edits the source in the UI and asserts the note file on disk contains the updated source (PRD §6). — `app.spec.ts` "renders a Mermaid code block…": seeds the note via `importMarkdownAsNote`, asserts the preview SVG, edits the source, polls the file for the update.

## Notes

- **Authoring:** a `/mermaid` slash-menu command inserts a diagram (a `codeBlock` tagged `mermaid` with a starter graph) so owners create diagrams from the editor, not just render existing ones. Covered by an E2E.
- **Storage is unchanged:** diagrams stay `codeBlock` blocks with a `language` prop. E7 overrides only how BlockNote *renders* that block; the on-disk format, Markdown import/export, and E2's fidelity guarantees all carry over untouched (data-model.md § Diagrams).
- The renderer registry (`src/renderer/src/diagrams/registry.ts`) is the app-layer seam; `mermaid.ts` is the v1 entry. Adding a language (PRD §7.4) is a new registry entry only.
- Non-text diagram types (e.g. Excalidraw sketches) are explicitly *not* in this epic — each needs a data-model decision first (PRD §7.4).
