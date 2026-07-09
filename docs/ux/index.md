# UX

> **This doc owns:** the app's information architecture, layout, and interactions. **For requirements see** [PRD §3.3](../product/prd.md); **for the component/code side see** [app-architecture](../architecture/app-architecture.md).

**Status: planned** — the spec E1–E4 build to. One surface: the main window. No routes, no onboarding flow beyond the vault picker.

## Layout

Two panels plus a global search overlay (ASCII wireframe — permitted exception to the Mermaid rule):

```
┌─────────────────────────────────────────────────────────────┐
│  ◦ vault name                          🔍 Search…  (⌘K)     │
├───────────────────┬─────────────────────────────────────────┤
│ FOLDER TREE       │  NOTE VIEW / EDITOR                     │
│                   │                                         │
│ ▾ Journal         │   2026-07-07 — Daily log                │
│    2026-07-07     │   #tags: journal, daily        [E2]     │
│  ▸ 2026-06…       │                                         │
│ ▾ Projects        │   BlockNote editor: the note body,      │
│    note-agent     │   richly rendered and editable in       │
│    home-lab       │   place; saves losslessly to the file.  │
│ ▸ Reference       │                                         │
│   RULES.md        │                                         │
│                   │                                         │
│ (right-click ⇒    │                                         │
│  context menu)    │                                         │
└───────────────────┴─────────────────────────────────────────┘
```

## Left panel — folder tree (E1, actions E3)

- Mirrors the vault's directory structure exactly ([data-model](../architecture/data-model.md)); `.brain/` internals hidden.
- Click a note → opens it on the right. Expand/collapse folders; state remembered per session (renderer-only, never written to the vault).
- **Right-click context menu (E3 ✓)**: on a note — Rename (inline) · Move to… · Edit tags · Delete (to trash); on a folder / the root — New note · New folder. Traces to [PRD §3.1–§3.3](../product/prd.md). (Folder rename/move/delete are not exposed yet.)
- External changes (agent/CLI/git) appear live via a file watcher — no refresh button as a crutch (E3 ✓).

## Right panel — note view/editor (E1 read-only, E2 editable)

- BlockNote renders the selected note's body; editing is in-place with debounced autosave to the note file (lossless — the file stores the editor's native blocks, [data-model](../architecture/data-model.md)).
- Title and tags shown above the body, tags editable (backed by note metadata).
- If the open note changes on disk, a non-destructive conflict banner (Reload / Keep mine) — never a silent clobber (E3 ✓).
- **Diagram blocks (E7 ✓):** a code block tagged `mermaid` renders inline as the diagram, with its text source shown directly beneath for editing; the diagram re-renders as you type. Invalid source shows the render error next to the intact, still-editable source. Unknown language tags display as normal code blocks. Behind an app-layer language→renderer registry, so more diagram languages are additions. Traces to [PRD §3.7](../product/prd.md).

## Search (⌘K, E4)

- Overlay from anywhere: type → hybrid results (keyword + semantic) with snippet and path → Enter opens the note.
- One search implementation for the owner and agents alike ([PRD §3.4](../product/prd.md)); this overlay is just its UI.

## Principles

- The vault is the interface: nothing in the UI (tags, structure, rules) exists anywhere but the files.
- Keyboard-first for the frequent loop: ⌘K → open → edit → done.
## Visual design (decided E1, 2026-07-09)

**Warm / paper direction** — a calm, Notion-like reading surface that gets out of the way of note content.

- **Palette:** warm off-white paper background (not stark white), soft warm-gray borders and secondary text, a single restrained accent. Light and dark are both first-class (the app respects OS theme); dark is a warm charcoal, not pure black.
- **Typography:** a humanist sans for body/UI; titles may take a serif accent for the "paper" feel. Generous line-height and comfortable measure for long-form reading.
- **Layout:** generous whitespace, low-contrast chrome, content-forward. The two panels share the paper surface with only a hairline divider.
- **Stack:** Tailwind CSS v4 (design tokens drive light/dark). Implemented in `apps/desktop`; tokens are defined once in the renderer's global stylesheet and reused.
