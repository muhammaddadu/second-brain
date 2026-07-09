# Value Proposition

> **This doc owns:** why this project exists, who it serves, and what success looks like. **For requirements see** [PRD](prd.md); **for build order see** [epics](epics/index.md).

## The problem

Notes apps are built for humans typing. AI agents are now doing a large share of the knowledge work — summarising days, researching topics, drafting plans — but their output lands in chat transcripts and gets lost. There is no personal knowledge base that is *equally* a first-class surface for the human (rich editing, browsable folders) and for agents (structured programmatic access, search built in, house rules to follow). Existing options fail one side: rich note apps have weak or bolted-on agent access; plain folders of Markdown have no rich UI and no retrieval.

## The product

A local-first **second brain**: one vault of notes in folders and tags the owner chooses — stored losslessly in the editor's native format, with Markdown in/out everywhere ([ADR 0001](../adr/0001-blocknote-json-canonical-note-format.md)) — with

- a desktop app (folder tree left, BlockNote rich editor right) for the human, and
- an MCP server + CLI for agents, backed by built-in RAG (full-text + semantic search),
- governed by owner-defined **rules** that tell every agent how to structure, place, and update notes.

The owner works with any agent — Claude, or anything MCP-capable — and says things like *"summarise my last 24 hours, check my vault, and insert the updates where they best fit or create new docs."* The agent searches the vault, reads the rules, and writes well-placed notes. Over months the vault compounds into a genuinely useful second brain, and it's all local files the owner keeps forever.

## Who it's for

The primary user is the owner (initially a single developer — Muhammad) working daily with AI agents. Secondary "users" are the agents themselves: the product succeeds only if an agent with no prior context can find the right place to read or write in one or two tool calls.

## What success looks like

Directional targets — measurable versions live in [PRD §6](prd.md#6-success-criteria):

- The owner reaches any note in seconds, by browsing or by search.
- An agent asked to file an update finds the right existing doc (or correctly decides to create one) without the owner naming paths.
- The vault survives the app: notes are documented, git-friendly JSON files, and whole-vault Markdown export always works — uninstalling loses nothing but the UI.
- The vault visibly grows and stays organised over time instead of decaying into an inbox.
