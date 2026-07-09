# Agent Integration

> **This doc owns:** how AI agents use the vault — MCP setup and tools, CLI usage, and how rules reach agents. **For what's required see** [PRD §3.5–§3.6](../product/prd.md); **for where rules are stored see** [data-model](../architecture/data-model.md).

**Status:** the **filesystem surface has shipped** ([ADR 0009](../adr/0009-agent-guide-and-installable-skill.md)); the MCP server (E6) and CLI (E5) are still to come.

## Filesystem surface (shipped)

The most direct way an agent works with a vault is its files. Every vault carries an app-maintained **`AGENTS.md`** at the root — the contract an agent needs to read/search/create/update notes safely: the `.note.json` envelope, folder/tag conventions, the reserved `.brain/`, `.order.json`, atomic/no-clobber writes, and a pointer to the owner's `RULES.md`. The app writes it on vault open and version-refreshes it as features land, **without clobbering owner edits** (marker + body hash). See [data-model § Rules](../architecture/data-model.md).

For agents not yet looking at a vault, the same contract installs as a **global Claude Code skill** (`second-brain-vault`) from **Settings → Agent access** — written to `~/.claude/skills/`, with update (version-aware) and remove. One body feeds both, so the in-vault guide and the skill never drift.

## MCP / CLI surfaces (planned)

These gain real content in the same changes as epic [E5](../product/epics/E5-cli.md) (CLI) and [E6](../product/epics/E6-mcp-rules.md) (MCP server + rules):

- **MCP setup**: registering the server with Claude Code / other MCP clients; the tool reference (search, read, tree, create, update, move, tag, rules, export).
- **CLI reference**: `brain` subcommands and `--json` output for scripting agents.
- **Content formats**: note content is written as Markdown (converted by core, no schema knowledge needed) or BlockNote block JSON, and read/exported as either — caller's choice per call ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)).
- **The rules handshake**: how an agent gets `RULES.md` before writing, and the expected read-rules → search-for-placement → write flow.
- **Worked example**: the canonical "summarise my last 24 hours and file it where it belongs" flow from [PRD §3.6](../product/prd.md), end to end.
