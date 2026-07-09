# Data Model

> **This doc owns:** what's stored and its formats — note files, the JSON envelope and metadata, tags, rules location, and the index schema. **For process shape see** [system-architecture](system-architecture.md); **for requirements see** [PRD §3.1–§3.4](../product/prd.md).

**Status: partly built** — the note envelope, tree, trash, vault marker, and Markdown import/export have shipped (E0/E2/E3/E7); the derived index schema is still the spec E4 builds to. Refine here (not in code comments) as the rest lands.

## The vault

A vault is a plain directory the owner chooses. Its folder hierarchy **is** the organisational hierarchy ([PRD §3.2](../product/prd.md)) — no mapping layer. App/index internals live under a reserved `.brain/` directory at the vault root, excluded from the note tree.

```
<vault>/
  Journal/2026-07-07.note.json   # notes: BlockNote JSON envelope, anywhere, any depth
  Journal/.order.json            # optional per-folder manual order (see Manual order)
  Projects/…/index.note.json
  RULES.md                       # vault rules — plain Markdown (deliberate exception, see Rules)
  .brain/
    vault.json                   # marker identifying this folder as a vault (created on first open)
    index.db                     # derived SQLite index — safe to delete, rebuildable
    trash/                       # soft-deleted notes (PRD §4.2)
```

The presence of `.brain/vault.json` is what makes a folder a *vault* (`core.isVault`); `core.initVault` creates it. This lets first-run setup create a fresh, dedicated vault in one click and recognise previously-used folders, instead of dropping the owner into a raw folder picker over an arbitrary directory.

### Manual order

A folder's children are shown folders-first, then alphabetical — **unless** the folder holds an `.order.json` sidecar, in which case listed children come first in that order and the rest fall back to the default sort. The file is a JSON array of on-disk entry names (a folder's directory name, a note's full `.note.json` filename), e.g. `["Ideas", "b.note.json", "a.note.json"]`. It is written by `core.setFolderOrder` (atomic write) when the user drags to reorder, and read by `core.listTree`.

It is **advisory and self-healing**: missing, partial, or malformed → default sort; unknown/stale entries are ignored and pruned on the next reorder; it never causes a note to disappear. Order lives inside the folder so it travels with the content on move/copy, and is intentionally *not* preserved by Markdown export (order is a presentation preference, not note content). Rationale and alternatives: [ADR 0005](../adr/0005-manual-ordering-per-folder-sidecar.md).

## Note format

One note = one `.note.json` file: a JSON envelope holding metadata plus the native BlockNote document. BlockNote JSON is canonical; Markdown is an export/input format — the why lives in [ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md).

```json
{
  "version": 1,
  "meta": {
    "title": "Optional display title",
    "tags": ["project-x", "decisions"],
    "created": "2026-07-07T09:30:00Z",
    "updated": "2026-07-07T14:10:00Z"
  },
  "blocks": []
}
```

- `version` is the envelope schema version; core migrates older envelopes forward on read and never writes an older version.
- `blocks` is the untransformed BlockNote document (`editor.document`) — persisted exactly as the editor produces it, per BlockNote's own guidance for lossless storage.
- `meta` keys above are the v1 set (`title` falls back to filename without extension; `created` set once; `updated` touched on every write). Unknown `meta` keys are **preserved verbatim** on read/write so owners and agents can add their own.
- Tags live *only* in `meta.tags` (one fact, one home). Folder location lives *only* in the path.
- **Deterministic serialization:** pretty-printed, 2-space indent, fixed key order (`version`, `meta`, `blocks`), trailing newline — so an unchanged note produces a byte-identical file and git diffs stay reviewable.

## Markdown import/export

Markdown remains a first-class *interchange* format at every surface, just not the resting format:

- **Write:** MCP/CLI/core accept note content as Markdown **or** BlockNote block JSON, caller's choice. Markdown is converted on write via BlockNote's parser (`tryParseMarkdownToBlocks`); unrecognised syntax degrades to plain text, never an error. Conversion runs **headless in core** via `@blocknote/server-util` so the CLI/MCP work with the app closed — mechanism and dependency rationale in [ADR 0003](../adr/0003-headless-markdown-conversion-server-util.md).
- **Read/export:** any note — or the whole vault — can be exported to Markdown on demand (`blocksToMarkdownLossy`). Export is a *view*: lossy by BlockNote's definition, acceptable because the JSON file remains the source of truth. Whole-vault export is the longevity guarantee (vault usable with the app gone) and is a tested, supported operation, not a nicety.
- Owned by [agent-integration](../guides/agent-integration.md): which MCP tools/CLI subcommands expose these formats.

## Diagrams

First-class in the UI, plain text content on disk ([PRD §3.7](../product/prd.md)): a diagram is a **code block** whose language tag selects the renderer — in the `blocks` array it is a BlockNote code block with `language: "mermaid"` and the diagram source as its text; in Markdown import/export it maps to a fenced code block (```` ```mermaid ````).

- No separate diagram files, no binary blobs — the diagram source is editable text inside the note, and agents write diagrams with the same tools they write prose (in either input format).
- The language-tag → renderer registry lives in the app layer; **the storage format never changes when a renderer is added**. v1 registry: `mermaid`. Candidates for later are tracked in [PRD §7.4](../product/prd.md#7-open-questions).
- Unknown language tags render as ordinary code blocks — never dropped.
- A diagram block untouched by an editing session must survive byte-identical in the JSON file (E7 acceptance criterion).

## Rules

Owner-defined agent conventions ([PRD §3.6](../product/prd.md)) live in `RULES.md` at the vault root — **plain Markdown, a deliberate exception to the note format**: its consumers are agents reading instructions verbatim, so it must stay directly readable without conversion. It is versioned with the vault and editable in the app (as raw text or via Markdown import/export). E6 may extend this to a `rules/` folder if one file gets unwieldy; record that change here first. How agents receive rules is owned by [agent-integration](../guides/agent-integration.md).

## Databases (planned — E8)

A **database** is a folder that also contains a `database.json` descriptor; each note in that folder is a **row**. Storage rationale is [ADR 0004](../adr/0004-databases-as-folders-of-notes-with-schema.md); this is the format E8 builds to.

```
Projects/                     # a database folder
  database.json               # schema: property definitions + saved views
  acme-migration.note.json    # a row (a normal note)
  billing-rework.note.json    # a row
```

- **Schema (`database.json`)** — documented, deterministically serialized JSON: an array of **property definitions** `{ id, name, type, options? }` (`type` ∈ `text | number | select | multiSelect | date | checkbox | url`; stable `id` so renaming a property never rewrites rows) plus saved **views** `{ name, type: "table" | "board", … }`. Views are presentation, not data.
- **Row values live in note metadata** — a row's typed values sit under `meta.properties` keyed by property id, alongside the v1 `meta` keys; the note body is the row's page content. Because a row *is* a note, the editor, hybrid search, Markdown export, watcher, and every agent/CLI/MCP tool operate on rows unchanged.
- **Values are not authoritative in the index** — the derived index *caches* `meta.properties` so table/board views render fast, but the files remain the source of truth (rebuildable).
- **Markdown export** renders a row's properties as a small header block above its body, so exported rows stay readable with the app gone.
- Relations (row-to-row links) and rollups are deferred; they share the link graph explored by the search graph (§ below) and need their own design.

## Index schema (derived)

SQLite database at `.brain/index.db`, WAL mode. Entirely derived — deleting it and rebuilding must reproduce equivalent search results (E4 acceptance criterion). Planned shape, to be refined in E4:

| Table | Holds | Notes |
|-------|-------|-------|
| `notes` | path, title, tags, mtime, content hash | one row per note; hash drives incremental reindex |
| `chunks` | note id, chunk text, position | plain text extracted from blocks, split for retrieval granularity |
| `chunks_fts` | FTS5 over chunk text | keyword/full-text leg of hybrid search |
| `embeddings` | chunk id, vector | semantic leg; provider pluggable, local default ([PRD §7.2](../product/prd.md#7-open-questions)) |

Hybrid query = FTS match ∪ vector nearest-neighbours, merged and ranked in core ([PRD §3.4](../product/prd.md)).
