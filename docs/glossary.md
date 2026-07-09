# Glossary

> **This doc owns:** the project's vocabulary. **For how the pieces relate see** [system-architecture](architecture/system-architecture.md).

| Term | Meaning |
|------|---------|
| **Vault** | The owner-chosen directory holding all notes, rules, and the derived index. The single source of truth. |
| **Note** | One `.note.json` file: a JSON envelope of metadata + the BlockNote document. Format in [data-model](architecture/data-model.md); why in [ADR 0001](adr/0001-blocknote-json-canonical-note-format.md). |
| **Note metadata** | The `meta` object of a note's envelope (title, tags, timestamps). The only home for tags. |
| **Envelope** | The note file's JSON wrapper: `version` + `meta` + `blocks`, deterministically serialized ([data-model](architecture/data-model.md)). |
| **Owner** | The single human a vault belongs to ([PRD §2.1](product/prd.md)). |
| **Agent** | Any AI system operating on the vault via MCP or CLI ([PRD §2.2](product/prd.md)). |
| **Surface** | One of the three ways into the vault: desktop app, CLI, MCP server — all shells over core. |
| **Core** | `packages/core`, the one library owning all vault logic. |
| **Rules** | Owner-written, in-vault Markdown conventions agents must follow when structuring/placing notes ([PRD §3.6](product/prd.md)). |
| **Index** | The derived SQLite database (`.brain/index.db`) powering search; always rebuildable, never authoritative. |
| **Hybrid search / RAG** | Retrieval combining full-text (FTS5) and semantic (vector-embedding) matching over note chunks. |
| **Chunk** | A retrieval-sized slice of a note's body, the unit of indexing and embedding. |
| **Block** | BlockNote's editing unit (paragraph, heading, list item…); persisted natively in the note envelope, losslessly ([ADR 0001](adr/0001-blocknote-json-canonical-note-format.md)). |
| **Diagram block** | A code block whose language tag (e.g. `mermaid`) selects a renderer; stored as plain text source, rendered as a live diagram ([PRD §3.7](product/prd.md)). |
| **Renderer registry** | The app-layer mapping from a code block's language tag to a diagram renderer; extending it adds diagram types without changing the storage format. |
| **Markdown export** | The on-demand conversion of a note (or the whole vault) to Markdown — a lossy *view* of the canonical JSON, and the vault's longevity escape hatch ([PRD §4.4](product/prd.md)). |
| **ADR** | Architecture Decision Record — the append-only WHY log at [docs/adr](adr/README.md). |
| **Trash** | `.brain/trash/` — where deleted notes go so deletion is recoverable ([PRD §4.2](product/prd.md)). |
| **Second brain** | The product goal: a personal knowledge base that compounds over time because both the owner and their agents maintain it. |
| **MCP** | Model Context Protocol — the standard by which agents discover and call the vault tools. |
