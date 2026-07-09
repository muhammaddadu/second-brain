# Data Model

> **This doc owns:** what's stored and its formats — note files, the JSON envelope and metadata, tags, rules location, and the index schema. **For process shape see** [system-architecture](system-architecture.md); **for requirements see** [PRD §3.1–§3.4](../product/prd.md).

**Status: planned** — formats below are the spec E0/E2/E4 build to; refine here (not in code comments) as they land.

## The vault

A vault is a plain directory the owner chooses. Its folder hierarchy **is** the organisational hierarchy ([PRD §3.2](../product/prd.md)) — no mapping layer. App/index internals live under a reserved `.brain/` directory at the vault root, excluded from the note tree.

```
<vault>/
  Journal/2026-07-07.note.json   # notes: BlockNote JSON envelope, anywhere, any depth
  Projects/…/index.note.json
  RULES.md                       # vault rules — plain Markdown (deliberate exception, see Rules)
  .brain/
    index.db                     # derived SQLite index — safe to delete, rebuildable
    trash/                       # soft-deleted notes (PRD §4.2)
```

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

- **Write:** MCP/CLI/core accept note content as Markdown **or** BlockNote block JSON, caller's choice. Markdown is converted on write via BlockNote's parser (`tryParseMarkdownToBlocks`); unrecognised syntax degrades to plain text, never an error.
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

## Index schema (derived)

SQLite database at `.brain/index.db`, WAL mode. Entirely derived — deleting it and rebuilding must reproduce equivalent search results (E4 acceptance criterion). Planned shape, to be refined in E4:

| Table | Holds | Notes |
|-------|-------|-------|
| `notes` | path, title, tags, mtime, content hash | one row per note; hash drives incremental reindex |
| `chunks` | note id, chunk text, position | plain text extracted from blocks, split for retrieval granularity |
| `chunks_fts` | FTS5 over chunk text | keyword/full-text leg of hybrid search |
| `embeddings` | chunk id, vector | semantic leg; provider pluggable, local default ([PRD §7.2](../product/prd.md#7-open-questions)) |

Hybrid query = FTS match ∪ vector nearest-neighbours, merged and ranked in core ([PRD §3.4](../product/prd.md)).
