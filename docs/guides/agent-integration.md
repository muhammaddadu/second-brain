# Agent Integration

> **This doc owns:** how AI agents use the vault — MCP setup and tools, CLI usage, and how rules reach agents. **For what's required see** [PRD §3.5–§3.6](../product/prd.md); **for where rules are stored see** [data-model](../architecture/data-model.md).

**TODO — the agent surfaces don't exist yet.** This doc gains real content in the same changes as epic [E5](../product/epics/E5-cli.md) (CLI) and [E6](../product/epics/E6-mcp-rules.md) (MCP server + rules). It is listed now because it is the doc the whole product funnels into.

## What this doc will own once E5/E6 land

- **MCP setup**: registering the server with Claude Code / other MCP clients; the tool reference (search, read, tree, create, update, move, tag, rules, export).
- **CLI reference**: `brain` subcommands and `--json` output for scripting agents.
- **Content formats**: note content is written as Markdown (converted by core, no schema knowledge needed) or BlockNote block JSON, and read/exported as either — caller's choice per call ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)).
- **The rules handshake**: how an agent gets `RULES.md` before writing, and the expected read-rules → search-for-placement → write flow.
- **Worked example**: the canonical "summarise my last 24 hours and file it where it belongs" flow from [PRD §3.6](../product/prd.md), end to end.
