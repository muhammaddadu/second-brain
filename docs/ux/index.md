# UX

> **This doc owns:** the app's information architecture, layout, and interactions. **For requirements see** [PRD §3.3](../product/prd.md); **for the component/code side see** [app-architecture](../architecture/app-architecture.md).

**Status: partly built** — the welcome screen and the main window (tree, editor, diagrams, file actions) have shipped (E1–E3, E7); the ⌘K search overlay lands with E4. Two surfaces: a first-run welcome screen and the main window.

## First run & the current vault (E1 ✓)

The vault is the app's org/tenant: **chosen once, then remembered and reopened automatically** on every later launch. The welcome screen appears only on a true first run (no remembered vault). It's a low-cognitive-load moment — a small warm illustration and one obvious action, with staggered entrance animations (reduced-motion respected):

- **Create a new vault** (primary) — makes a fresh, dedicated folder at a sensible default (`~/SecondBrain`, no space, de-duplicated) and opens it, seeded with a small **folder-organised starter set** (Welcome + a Guide folder covering folders/tags, search & RAG, agents, and diagrams; an Ideas note on the local-first principles; and an example Journal note). It's real content so the first view isn't an empty tree — and gives search/semantic retrieval something to find immediately. One click, no decisions. The default is the home directory, **not** `~/Documents` or `~/Desktop`, on purpose: those are commonly iCloud-synced, and a cloud daemon syncing the vault (especially the SQLite index/WAL) fights the app's atomic writes and watcher.
- **Open an existing folder…** — the OS picker, for choosing a specific location.
- **Recent** — previously-used vaults, when any exist.

**Changing vault later** goes through the header **vault switcher** (the "context bar" — an org/tenant-style menu on the vault name): reopen a recent vault, open a folder, or create a new one. No forced return to the welcome screen.

**What makes a folder a vault:** the presence of a `.brain/vault.json` marker ([data-model](../architecture/data-model.md)). Creating or opening a folder writes it; recent entries are validated against it, so stale/deleted paths silently drop off (and the most-recent still-valid vault is what auto-opens). An explicit `BRAIN_VAULT` env var overrides everything (dev/tests); `BRAIN_NO_VIBRANCY` forces the opaque, non-translucent look.

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
- Click a note → opens it on the right. Expand/collapse folders; state remembered per session (renderer-only, never written to the vault). On launch the **first note opens automatically**, so the editor starts with content, not the empty state (a deep link / CLI open-to-page takes precedence).
- **Keyboard navigation:** with the tree focused, ↑/↓ move between visible rows, ←/→ collapse/expand a folder (or step to its parent), Enter opens the focused note/database/folder, and Delete asks before moving to trash. Destructive actions (tree delete, keyboard delete) always confirm first.
- **Right-click context menu (E3 ✓)**: on a note — Rename (inline) · Move to… · Edit tags · Delete (to trash); on a folder — New note · New folder · Rename (inline) · Move to… · Delete (to trash); on the root — New note · New folder. Creating a folder drops straight into inline rename, and creating inside a folder keeps it open. Traces to [PRD §3.1–§3.3](../product/prd.md).
- **Drag to sort (E3 ✓)**: drop an item onto a folder's **middle** (or the empty sidebar) to *move* it there — the folder highlights; drop onto a sibling's **top/bottom edge** to *reorder* — a thin accent line shows where it lands. Reordering persists per-folder (a `.order.json` sidecar, [ADR 0005](../adr/0005-manual-ordering-per-folder-sidecar.md)) and is offered only between current siblings, so a reorder never silently moves a file.
- **Drop files to import**: drag `.md`/`.txt`/`.docx`/`.pdf`/`.csv`/`.xlsx` files from the OS onto the tree (or onto a folder) and each converts into a native note — title from the filename, never overwriting (unique names). Unsupported/corrupt files report a per-file reason inline, not a silent skip.
- External changes (agent/CLI/git) appear live via a file watcher — no refresh button as a crutch (E3 ✓).

## Right panel — note view/editor (E1 read-only, E2 editable)

- BlockNote renders the selected note's body; editing is in-place with debounced autosave to the note file (lossless — the file stores the editor's native blocks, [data-model](../architecture/data-model.md)).
- Title and tags shown above the body (backed by note metadata). The **title is editable, and editing it renames the note's file** to match (sanitized, de-duplicated in the same folder); tags are editable too.
- If the open note changes on disk, a non-destructive conflict banner (Reload / Keep mine) — never a silent clobber (E3 ✓).
- **Wikilinks (E9 ✓):** type `[[` to link another note — a picker suggests notes; `[[People/Ada Lovelace]]` (or bare `[[Ada Lovelace]]`) renders as a clickable link that opens the target. A link to a note that doesn't exist yet shows dashed/muted and creates it on click. Each note shows a **"Linked from"** list of everything that links to it, and links become edges in the knowledge graph. Links are plain text in the file (nothing proprietary), so agents write them too ([ADR 0010](../adr/0010-wikilinks-plain-text-with-nondestructive-rendering.md)).
- **Diagram blocks (E7 ✓):** a code block tagged `mermaid` renders inline as the diagram, with its text source shown directly beneath for editing; the diagram re-renders as you type. Invalid source shows the render error next to the intact, still-editable source. Unknown language tags display as normal code blocks. Behind an app-layer language→renderer registry, so more diagram languages are additions. Traces to [PRD §3.7](../product/prd.md).

## Settings (E1 ✓)

A **Settings** entry pinned at the bottom of the sidebar opens a dedicated preferences page (sidebar stays in place) — the seam for user preferences over time. Today: **Appearance** — Theme (System / Light / Dark, applied live via `nativeTheme`) and Reduce transparency (turns off the vibrancy/Mica effect); and **Semantic search** — a toggle (off by default; keyword search always works and stays local) that, when on, opens a guided provider flow: a **"Scan this machine"** button detects local runtimes, then a compact **provider card grid** (on-machine · private → cloud) where each tile shows privacy + difficulty + detected status; the **Built-in** on-device provider (EmbeddingGemma, zero-config) is the recommended default. Picking one reveals only that provider's fields (nothing for built-in; endpoint/model for local; API key for hosted; region + optional keys for AWS Bedrock), a **Test connection** action with plain-language results, and **index controls** (counts, rebuild, pause, clear semantic index). Secrets are stored in the OS keychain, never in the vault ([ADR 0008](../adr/0008-embedding-provider-adapters-and-discovery.md)). And **Agent access** — explains that agents can work the vault through its files (every vault carries a maintained `AGENTS.md` contract) and offers a one-click install of a global Claude Code skill so any agent knows how to use a vault, with update/remove ([ADR 0009](../adr/0009-agent-guide-and-installable-skill.md)). Preferences persist in the app config and apply immediately.

## Search (⌘K, E4 — keyword shipped)

- Overlay from anywhere (⌘K/Ctrl+K, or the header Search button): type → results with a highlighted snippet and folder → ↑/↓ to move, Enter or click to open, Esc to dismiss. **Keyword (full-text) search has shipped**; semantic results merge into the same list when the embeddings slice lands.
- One search implementation for the owner and agents alike ([PRD §3.4](../product/prd.md)); this overlay is just its UI over the derived index in core ([data-model](../architecture/data-model.md) § Index schema, [ADR 0006](../adr/0006-wasm-sqlite-for-derived-index.md)).

## Principles

- The vault is the interface: nothing in the UI (tags, structure, rules) exists anywhere but the files.
- Keyboard-first for the frequent loop: ⌘K → open → edit → done.
## Visual design (decided E1, 2026-07-09)

**Warm / paper direction** — a calm, paper-like reading surface that gets out of the way of note content.

- **Palette:** warm off-white paper background (not stark white), soft warm-gray borders and secondary text, a single restrained accent. Light and dark are both first-class (the app respects OS theme); dark is a warm charcoal, not pure black.
- **Typography:** a humanist sans for body/UI; titles may take a serif accent for the "paper" feel. Generous line-height and comfortable measure for long-form reading.
- **Layout:** generous whitespace, low-contrast chrome, content-forward. The two panels share the paper surface with only a hairline divider. Sidebar and title bar share one warm chrome tone and keep an explicit tinted background even under macOS vibrancy, so the window effect adds subtle depth without the chrome ever falling through to the raw (black-when-inactive) effect layer.
- **Stack:** Tailwind CSS v4 (design tokens drive light/dark). Implemented in `apps/desktop`; tokens are defined once in the renderer's global stylesheet and reused.
- **Motion & stability:** subtle, fast, GPU-friendly (opacity/transform only) — content fades in on note/page switch, tree children and popovers ease in, hover states transition. Layout must not jump: matched containers across loading/loaded states and a stable scrollbar gutter. All motion auto-disables under `prefers-reduced-motion`.
