# 0010. Wikilinks: plain `[[target]]` text, resolved path-then-title, rendered non-destructively

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

Owners already hand-author `[[Folder/Note]]` references in notes (e.g. `[[People/Robert Kohler]]`). We want native support: links that render, click through to the target, autocomplete on `[[`, offer to create a missing target, feed the knowledge graph, and expose backlinks — like Obsidian.

Two questions are hard to reverse once thousands of links exist and must be settled up front: **how a link is stored** in a note (canonical format is BlockNote JSON — [ADR 0001](0001-blocknote-json-canonical-note-format.md)), and **how a target string resolves to a note**. The non-negotiables bind both ([AGENTS.md](../../AGENTS.md)): files are the single source of truth; no opaque formats; Markdown export must keep the vault usable with the app gone; agents write via Markdown/plain text with no schema knowledge; and **no silent data loss** — an editing session must never corrupt a note.

## Decision Drivers

1. **No data loss** — links must not introduce a lossy round-trip through the editor/autosave path.
2. **Agent-writable with zero schema knowledge** — an agent appending `[[X]]` as text must Just Work, read and written.
3. **Files-first, longevity** — links survive Markdown export and stay human-readable on disk.
4. **Forgiving resolution** — match how owners actually write links (full paths *and* bare names).
5. **One resolver, every surface** — editor, backlinks, and graph must resolve identically.

## Options Considered

### Storage

**Option A — plain `[[target]]` text in the document, rendered by a non-destructive editor decoration (chosen).** The note stores exactly the characters `[[People/Robert Kohler]]` inside a normal text run. A ProseMirror decoration overlays clickable styling at render time without changing the document; the bytes on disk never change just because a note was opened.

- Good: zero round-trip risk — opening/editing a note never rewrites its links (driver 1); an agent's raw `[[...]]` renders identically to app-authored ones (driver 2); links export to Markdown unchanged and read cleanly (driver 3).
- Bad: no custom inline node means we can't (yet) hide the brackets or render a different display label inline — the `[[...]]` shows literally. Acceptable: it's honest about the underlying text and matches what many Markdown tools do.

**Option B — a custom BlockNote inline-content node, with text⇄node transforms at load/save.** Prettier inline rendering (hide brackets, show alias), but every autosave must flatten nodes back to `[[...]]` text and every load must inflate — a lossy-transform hazard directly against driver 1, and it changes the on-disk shape away from plain text (weakens drivers 2/3). Rejected: the rendering polish is not worth a corruption risk on the hot save path.

**Option C — convert `[[...]]` into BlockNote's native link mark (`[text](secondbrain://…)`).** Reuses built-in link rendering, but rewrites the stored form away from `[[...]]`, so agent-authored plain links silently mutate on save and the Markdown export is `[text](url)`, not `[[...]]`. Rejected on drivers 2/3.

### Resolution

**Path, then unique title/filename (chosen).** Resolve `target` as an exact vault path first (`Folder/Note` → `Folder/Note.note.json`, case-insensitive fallback); if that misses, match a unique note whose filename or title equals the last segment. Ambiguous bare names (same filename in two folders) deliberately do **not** resolve — the full path still does.

- Good: supports both the path form owners already write and bare `[[Title]]` (driver 4); deterministic and unsurprising; ambiguity fails safe (unresolved, offer to create) rather than guessing wrong.
- Alternatives — *path-only* (rejected: bare names are common and convenient) and *title-only, Obsidian-style* (rejected: silently ambiguous when titles repeat, and ignores the path structure owners are already using).

## Decision

Store wikilinks as **plain `[[target]]` / `[[target|alias]]` text**; render them clickable with a **non-destructive ProseMirror decoration** (never mutating the document); resolve **path-first, then unique title/filename**. A single pure core module (`wikilinks.ts`: `parseWikilinks`, `resolveWikilink`) is the one resolver used by the editor decoration, the backlinks panel, and the graph's link edges (driver 5). Backlinks and graph edges are **derived by reading the notes** — never stored — so they rebuild from the files like every other derived view.

## Consequences

- Opening or editing a note is guaranteed not to rewrite its links; the conflict guard and byte-identical round-trip (ADR 0001/0002) are preserved.
- Agents get wikilinks for free: append `[[X]]` as Markdown/text and it renders, resolves, backlinks, and graphs with no new tool or schema.
- The brackets are visible in the editor (no inline alias hiding yet). If that becomes a real want, it's a *rendering* change (Option B behind a safe transform, or a display decoration) that does not alter stored files — revisit then.
- Backlinks/graph recompute by scanning notes; on a very large vault that scan may need the index to cache outgoing links (like it caches text). Revisit if link scans get slow — the storage decision here does not change.
- Headings/block references (`[[Note#Heading]]`) are parsed but only the note resolves today; sub-note anchors are future work.
