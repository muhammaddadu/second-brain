# Agent Integration

> **This doc owns:** how AI agents use the vault — MCP setup and tools, CLI usage, and how rules reach agents. **For what's required see** [PRD §3.5–§3.6](../product/prd.md); **for where rules are stored see** [data-model](../architecture/data-model.md).

**Status:** the **filesystem surface has shipped** ([ADR 0009](../adr/0009-agent-guide-and-installable-skill.md)); the MCP server (E6) and CLI (E5) are still to come.

## Filesystem surface (shipped)

The most direct way an agent works with a vault is its files. Every vault carries an app-maintained **`AGENTS.md`** at the root — the contract an agent needs to read/search/create/update notes safely: the `.note.json` envelope, folder/tag conventions, the reserved `.brain/`, `.order.json`, atomic/no-clobber writes, and a pointer to the owner's `RULES.md`. The app writes it on vault open and version-refreshes it as features land, **without clobbering owner edits** (marker + body hash). See [data-model § Rules](../architecture/data-model.md).

For agents not yet looking at a vault, the same contract installs as a **global Claude Code skill** (`second-brain-vault`) from **Settings → Agent access** — written to `~/.claude/skills/`, with update (version-aware) and remove. One body feeds both, so the in-vault guide and the skill never drift.

## CLI surface — `brain` (shipped)

A thin shell over core ([E5](../product/epics/E5-cli.md)) for agents/scripts and the owner in a terminal, with the app open or closed. The vault comes from `--vault <path>` or `BRAIN_VAULT`; add `--json` to `read`/`search`/`tree`/`tag`/`rules` for stable, parseable output.

| Command | Does |
|---------|------|
| \`brain tree\` / \`list\` | print the folder/note tree |
| \`brain read <path>\` | show a note (title + text; \`--json\` = the envelope) |
| \`brain search <query> [--limit N]\` | search — semantic when \`BRAIN_EMBED\` is set, else keyword |
| \`brain create <path> [--title T] [--tags a,b] [--content "markdown"]\` | create a note |
| \`brain update <path> [--title] [--tags] [--content]\` | update title / tags / body |
| \`brain move <from> <to>\` · \`brain tag <path> [--set/--add/--remove]\` · \`brain trash <path>\` | move / retag / delete-to-trash |
| \`brain rules\` | print the vault's \`RULES.md\` |
| \`brain index rebuild\` | rebuild the derived search index |

**Semantic search from the CLI:** the CLI is plain Node (no app keychain), so an embedding provider is configured via environment — `BRAIN_EMBED` (kind), `BRAIN_EMBED_MODEL`, `BRAIN_EMBED_BASE_URL`, `BRAIN_EMBED_API_KEY`, `BRAIN_EMBED_REGION`, `BRAIN_EMBED_CACHE`. Local / on-device providers need no key. Unset → keyword only. Same core retrieval as the app.

## MCP surface — `brain-mcp` (shipped)

A stdio MCP server over core ([E6](../product/epics/E6-mcp-rules.md)); runs headless, app open or closed. Register it with Claude Code:

```bash
claude mcp add second-brain -- node packages/mcp/dist/index.js --vault /path/to/vault
# (or set BRAIN_VAULT in the server env instead of --vault)
```

| Tool | Does |
|------|------|
| `get_rules` | the owner's `RULES.md` — every write-tool description tells agents to call this first |
| `list_tree` | folder/note hierarchy as JSON |
| `search` | ranked hits with snippets — keyword, plus semantic when `BRAIN_EMBED*` env is set (same env contract as the CLI) |
| `read_note` | title + tags + Markdown body |
| `create_note` / `update_note` | write with **Markdown content** (core converts; a title change renames the file, same as the app) |
| `move_note` / `trash_note` | relocate / delete-to-trash (recoverable) |

**The rules handshake:** new vaults seed a starter `RULES.md` (edited in Settings → Agent access); agents call `get_rules` → `search` for placement → write. The canonical "summarise my last 24 hours and file it where it belongs" flow is executable and test-proven: `packages/mcp/src/server.test.ts` scripts an MCP client through rules → search → update-existing → create-in-the-mandated-folder and asserts on the resulting files.

**Content formats:** write tools accept Markdown (converted by core — no schema knowledge needed); reads return Markdown; the on-disk canonical format stays BlockNote JSON ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)).
