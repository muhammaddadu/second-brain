# Architecture Decision Records

> **This doc owns:** architecture decision records — the WHY behind hard-to-reverse technical choices. **For what the current design is see** [data-model](../architecture/data-model.md) and [system-architecture](../architecture/system-architecture.md), which link here instead of restating rationale.

Significant architecture decisions, one per file, append-only. A decision is never rewritten — it is superseded by a new ADR. Routing index: [docs/README.md](../README.md).

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-blocknote-json-canonical-note-format.md) | Store notes as BlockNote JSON; Markdown becomes an export/input format | accepted |
| [0002](0002-vault-concurrency-atomic-write-rename.md) | Coordinate concurrent vault writes with atomic write-then-rename + watcher, not locking or a daemon | accepted |
| [0003](0003-headless-markdown-conversion-server-util.md) | Convert Markdown in headless core via @blocknote/server-util | accepted |
| [0004](0004-databases-as-folders-of-notes-with-schema.md) | Model databases as a folder of notes plus a schema descriptor, values in note metadata | accepted |
| [0005](0005-manual-ordering-per-folder-sidecar.md) | Persist manual folder/note order in a per-folder `.order.json` sidecar | accepted |
| [0006](0006-wasm-sqlite-for-derived-index.md) | Build the derived search index on WASM SQLite (`node-sqlite3-wasm`), not a native binding | accepted |
