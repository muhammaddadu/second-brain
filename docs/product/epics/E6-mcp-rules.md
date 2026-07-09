# E6 — MCP server & vault rules

> **This doc owns:** the acceptance state of the MCP/rules epic. **Index:** [epics](index.md). **Agent-facing behaviour:** [agent-integration](../../guides/agent-integration.md).

**Status:** Planned · **Depends on:** E5 · **PRD:** §3.5, §3.6, §6

## Goal

The epic the whole product exists for: an MCP server exposing the vault to any MCP-capable agent, and the **rules system** that tells agents how to structure and place what they write. After this epic, the canonical flow works end to end — "summarise my last 24 hours and file it where it belongs" — with the agent discovering rules and locations itself.

## Deliverables

- `packages/mcp`: stdio MCP server over core — tools for search, read, tree/list, create, update, move, tag, plus a way for agents to get the vault rules up front (tool description and/or a dedicated rules tool).
- Rules convention: owner-editable Markdown rules living in the vault (location/format owned by [data-model](../../architecture/data-model.md)); seeded default rules file.
- Setup + tool reference + example agent workflows documented in [agent-integration](../../guides/agent-integration.md) in the same change.

## Acceptance criteria

### Functional

- [ ] The MCP server registers with a real client (e.g. Claude Code) and all tools list and execute against a fixture vault (PRD §3.5).
- [ ] Tools are thin calls into core; search results match CLI/app for the same query (PRD §3.5).
- [ ] An agent can retrieve the vault rules through MCP before writing; the seeded rules file is owner-editable in the app like any note (PRD §3.6).
- [ ] Server runs headless with the desktop app closed, and concurrent writes with the app open are safe (PRD §3.5).
- [ ] Lint / typecheck / unit tests / build all pass.

### E2E validation

- [ ] A scripted MCP client runs the canonical flow against a fixture vault with rules: fetch rules → search for placement → update an existing note and create a new one in the rule-mandated locations — asserting on the resulting files (PRD §6).

## Notes

Agent permission tiers (read-only agents, approval gates) stay out of scope per PRD §5 — record demand here if it surfaces.
