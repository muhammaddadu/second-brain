# Documentation

Routing table for **note-agent-second-brain**. Each doc owns one concern; find the right one here, then read it. Every doc opens with a one-line "owns / for X see Y" header.

## Find the right doc

| If you need… | Go to | Which owns |
|--------------|-------|-----------|
| Why we're building this, value, success metrics | [value-proposition](product/value-proposition.md) | the *why* |
| What must be true — requirements, scope, acceptance criteria | [PRD](product/prd.md) | the *what* |
| What to build next, in what order | [epics](product/epics/index.md) | build order (E0–E9 + E11 shipped; [E10](product/epics/E10-deeper-memory-semantics.md) proposed) |
| How it looks — layout, panels, interactions | [UX hub](ux/index.md) | UX |
| How notes are stored — file format, envelope/metadata, tags, index schema | [data-model](architecture/data-model.md) | storage |
| Process topology — app, CLI, MCP server, shared core, concurrency | [system-architecture](architecture/system-architecture.md) | system shape |
| Code structure, module map, monorepo layout | [app-architecture](architecture/app-architecture.md) | code layout |
| Library/dependency choices and why | [tech-stack](architecture/tech-stack.md) | dependencies |
| Why a past technical choice was made | [ADR log](adr/README.md) | decision rationale |
| Run it locally | [getting-started](guides/getting-started.md) | local dev |
| Marketing site (Vite one-pager) | [apps/web/README](../apps/web/README.md) · [live site](https://muhammaddadu.github.io/second-brain/) | product website (GitHub Pages) |
| Build installers & cut a release | [building-and-releasing](guides/building-and-releasing.md) | packaging |
| How agents use the vault — MCP tools, CLI, the rules system | [agent-integration](guides/agent-integration.md) | agent surface |
| What a domain term means | [glossary](glossary.md) | vocabulary |

> Working in the repo (human or AI)? Start with [`AGENTS.md`](../AGENTS.md) and [`LEARNINGS.md`](../LEARNINGS.md) at the repo root.

## Reading paths

- **New to the project:** [value-proposition](product/value-proposition.md) → [system-architecture](architecture/system-architecture.md) → [glossary](glossary.md)
- **Understanding the product:** [value-proposition](product/value-proposition.md) → [PRD](product/prd.md) → [UX hub](ux/index.md) → [epics](product/epics/index.md)
- **Building a feature:** [epics](product/epics/index.md) → [PRD](product/prd.md) → [data-model](architecture/data-model.md) → [app-architecture](architecture/app-architecture.md)
- **Working as an agent on a user's vault (once built):** [agent-integration](guides/agent-integration.md) → [data-model](architecture/data-model.md)

## Conventions

- **One fact, one home.** Each concern lives in exactly one doc; others link to it rather than restate it. If you're tempted to duplicate, link instead.
- Every doc opens with a one-line ownership header (`> **This doc owns:** … **For X see** …`).
- Keep docs current in the same change as the code/decision. No placeholder sections.
- Mermaid for diagrams and flows, not ASCII art — **except** page-layout mockups, where ASCII wireframes are allowed (they show responsive layouts Mermaid can't). "Planned" content must be labelled and trace to the PRD or data model.
- The requirements doc keeps **stable section numbers** (§1, §2, …) so cross-references resolve; slim bodies, don't renumber.
