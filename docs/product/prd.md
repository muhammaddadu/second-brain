# PRD — note-agent-second-brain

> **This doc owns:** the requirements — what must be true, in and out of scope. **For why see** [value-proposition](value-proposition.md); **for build order see** [epics](epics/index.md); **for storage details see** [data-model](../architecture/data-model.md).

Section numbers are **stable** — slim the bodies, don't renumber. Everything here is **planned**; nothing is built yet.

## §1 Purpose

A local-first desktop second brain: notes in owner-chosen folders and tags, rich-edited by the owner in a BlockNote UI and stored in BlockNote's native format with Markdown import/export at every surface ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)), read/written by AI agents through MCP and CLI surfaces under owner-defined rules, with built-in RAG so both humans and agents can find things. See [value-proposition](value-proposition.md).

## §2 Users

- **§2.1 Owner** — a single human per vault. Full control: browses, edits, organises, defines the rules agents follow. Initially the developer of this project; design for one user, not multi-tenant.
- **§2.2 Agents** — any MCP-capable agent (Claude, etc.) or anything that can run a CLI. Read, search, create, and update notes; must follow the vault rules (§3.6). Agents operate with the owner's authority — there is no separate agent permission model in v1.

## §3 Functional requirements

### §3.1 Vault & notes

- A vault is a directory on disk chosen by the owner. Notes are BlockNote JSON envelopes — metadata + the editor's native block document, persisted losslessly (format owned by [data-model](../architecture/data-model.md); rationale in [ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)).
- The vault remains usable without the app: note files are documented, deterministically serialized JSON (git- and grep-workable), and whole-vault Markdown export is always available (§4.4).
- Create, read, update, rename, move, delete (to trash — no silent permanent loss) for notes and folders.
- External changes (editor, git pull, agent writes) are picked up by the app without restart.

### §3.2 Organisation

- Folders: arbitrary owner-chosen hierarchy, mirrored 1:1 to directories.
- Tags: per-note, stored in note metadata; a note can have many tags; tags are browsable/searchable.

### §3.3 Desktop app

- Cross-platform (macOS, Windows, Linux) desktop app with a React UI.
- Left panel: navigable folder tree; click opens a note; right-click opens a context menu of file actions (new note/folder, rename, move, delete, tag). Layout owned by [UX hub](../ux/index.md).
- Right panel: rich view/editor of the selected note rendered with [BlockNote](https://www.blocknotejs.org/docs); edits persist to the note file with no loss of structure.
- In-app search over the whole vault (§3.4) reachable from anywhere (e.g. ⌘K).

### §3.4 Search & RAG

- Hybrid retrieval built in: full-text (exact/keyword) plus semantic (vector embeddings), merged and ranked.
- The index is derived from the files and fully rebuildable; it updates incrementally as notes change.
- The same search serves the app UI, the CLI, and MCP tools — one implementation in the core library.
- Default embedding path is local (no note content leaves the machine); a remote embedding provider is opt-in configuration.

### §3.5 Agent surfaces

- **MCP server**: exposes vault tools to agents — at minimum search, read, list/tree, create, update, move/tag — plus access to the rules (§3.6). Runs headless; does not require the desktop app to be open.
- **CLI**: the same operations from a terminal, for scripting and for agents without MCP.
- Note content crosses both surfaces in the caller's choice of format: Markdown (converted on write) or BlockNote block JSON; reads/exports available as either ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md), format details in [data-model](../architecture/data-model.md)).
- Both surfaces are thin shells over the shared core library; behaviour is identical across surfaces.
- Concurrent access is safe: an agent writing while the app is open must not corrupt notes or the index (mechanism owned by [system-architecture](../architecture/system-architecture.md)).

### §3.6 Rules

- The owner defines vault rules — conventions for structure, placement, naming, and formatting of notes (e.g. "daily summaries go in `Journal/YYYY-MM-DD`", "each project gets a folder with an `index` note").
- Rules live *in the vault* as plain Markdown (`RULES.md` — a deliberate exception to the note format so agents read them verbatim; [data-model](../architecture/data-model.md) → Rules), and are surfaced to agents prominently via MCP/CLI (an agent should be told the rules before it writes).
- Canonical example flow: owner asks an agent to "summarise the last 24 hours"; the agent reads the rules, searches the vault for where such updates belong, and inserts into existing notes or creates new ones accordingly.

### §3.7 Diagrams

- Diagrams are first-class note content: stored as code blocks whose language tag selects the renderer (a fenced ```` ```mermaid ```` block in Markdown; a code block with `language: "mermaid"` in block JSON), rendered as diagrams in the app, and readable/writable by agents as plain text like any other content.
- v1 renders **Mermaid**. The language-tag → renderer mapping is extensible so further text-based diagram languages can be added without changing the storage format (storage owned by [data-model](../architecture/data-model.md)).
- The owner can edit a diagram's source in the app and see the rendered result update; invalid source shows the error alongside the intact source — it never destroys or hides the content.
- Unknown/unsupported language tags fall back to plain code blocks, never dropped.

## §4 Non-functional requirements

- **§4.1 Local-first & private.** Fully functional offline; note content leaves the machine only via explicitly configured opt-in providers.
- **§4.2 Data safety.** Files are the single source of truth; deletes are recoverable; no data lives only in the index or app state.
- **§4.3 Performance.** Vaults of several thousand notes stay responsive: tree navigation and note open feel instant; search returns in well under a second. (Numbers to be firmed up when E4 lands.)
- **§4.4 Longevity.** No lock-in: uninstalling the app loses nothing but the UI. Note files are documented JSON, and whole-vault Markdown export is a supported, tested operation — the escape hatch must always work.

## §5 Out of scope (v1)

Sync/multi-device, mobile, collaboration/multi-user, agent permission tiers, attachments beyond basic images, plugin system, publishing/sharing. Revisit only after the epics in [epics/index.md](epics/index.md) ship.

## §6 Success criteria

- Owner can go from a fresh machine to browsing and editing their vault in under 10 minutes.
- An agent, given only the MCP server and a request like the §3.6 example, files updates in places the owner judges correct without being given paths.
- Editor fidelity: open a note, edit in BlockNote, save, reopen — nothing is lost or reformatted; blocks untouched by the edit are byte-identical in the file.
- Escape hatch: whole-vault Markdown export produces a readable Markdown tree of every note with no owner intervention (§4.4).
- Search finds a note by meaning, not just keywords, in a 1000+ note vault.
- An agent adds a Mermaid diagram to a note via MCP/CLI — writing plain Markdown, no schema knowledge — and it renders as a diagram in the app with no owner intervention (§3.7).

## §7 Open questions

- **§7.1 BlockNote ↔ Markdown fidelity.** ~~Decide which blocks round-trip and what happens to the rest.~~ **Resolved by [ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md):** notes are stored as BlockNote JSON, so editing is lossless by construction; Markdown conversion (lossy by BlockNote's design) happens only at import/export boundaries where loss is acceptable.
- **§7.2 Local embedding model.** Which local embedding model/runtime balances quality and install size (decide in E4).
- **§7.3 Concurrency mechanism.** File locking vs. last-write-wins + watcher refresh vs. single-writer daemon (decide in E0/E4; owned by system-architecture once decided).
- **§7.4 Diagram/embed types beyond Mermaid.** Which further first-class types (e.g. Graphviz/DOT, math/KaTeX, Excalidraw sketches) and in what order. Text-based languages slot into the §3.7 renderer registry; anything with a non-text or binary format needs a [data-model](../architecture/data-model.md) decision first (it strains the text-content and Markdown-export rules). Decide per type as demand appears, starting during E7.
