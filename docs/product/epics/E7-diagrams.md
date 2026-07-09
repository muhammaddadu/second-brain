# E7 — Diagrams as first-class blocks

> **This doc owns:** the acceptance state of the diagrams epic. **Index:** [epics](index.md). **Storage format:** [data-model](../../architecture/data-model.md); **interaction spec:** [UX hub](../../ux/index.md).

**Status:** Planned · **Depends on:** E2 · **PRD:** §3.7, §6, §7.4

## Goal

Make diagrams first-class citizens of a note: a code block tagged `mermaid` — whether typed by the owner or written by an agent (as Markdown through core's import, or as block JSON) — renders as a live diagram in the editor, is editable as source with live re-render, and survives editing byte-intact. Builds directly on E2's editor via a custom BlockNote block, behind a language-tag → renderer registry so further text-based diagram languages ([PRD §7.4](../prd.md#7-open-questions)) are additions, not redesigns.

## Deliverables

- Custom BlockNote diagram block: code blocks with a registered language tag render as diagrams; source/preview editing per the [UX spec](../../ux/index.md).
- Mermaid renderer as the v1 registry entry; render errors shown alongside intact source.
- Renderer registry seam in the app layer — adding a language touches no storage code ([data-model](../../architecture/data-model.md) → Diagrams).
- Diagram-block coverage added to E2's fidelity suite (byte-identical persistence) and Markdown import/export mapping (fenced block ↔ diagram block).

## Acceptance criteria

### Functional

- [ ] A code block tagged `mermaid` in a note renders as a diagram in the editor (PRD §3.7).
- [ ] The owner can edit a diagram's source in-app and the rendered diagram updates; saving persists the source text losslessly in the note file (PRD §3.7).
- [ ] Importing Markdown with a ` ```mermaid ` fenced block produces a diagram block; exporting produces the fenced block back (PRD §3.7).
- [ ] Invalid Mermaid source shows the render error with the source intact and editable — content is never destroyed or hidden (PRD §3.7).
- [ ] A code block with an unregistered language tag renders as an ordinary code block, never dropped (PRD §3.7).
- [ ] A diagram block untouched during an editing session survives byte-identical on disk (PRD §4.2, §6).
- [ ] Registering a second (test/dummy) renderer requires only a registry entry — proves the extensibility seam (PRD §3.7).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] An E2E spec adds a Mermaid diagram to a note agent-style (Markdown through core's import, no schema knowledge), asserts the app renders it as a diagram, then edits the source in the UI and asserts the note file on disk contains the updated source (PRD §6).

## Notes

Non-text diagram types (e.g. Excalidraw sketches) are explicitly *not* in this epic — each needs a data-model decision first (PRD §7.4).
