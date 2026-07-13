# E10 — Deeper memory semantics (proposed)

> **This doc owns:** a **proposed** post-v1 epic distilled from external marketing-reference concepts. **It is not scheduled.** Decide go/no-go before any implementation. **Index:** [epics](index.md). **Current product truth:** [value-proposition](../value-proposition.md), [PRD](../prd.md).

**Status:** Proposed (not started) · **Depends on:** E4, E6, E9 (if pursued) · **PRD:** none yet — would need new sections if accepted

## Why this exists

Shipped epics (E0–E9) already deliver a local vault with agent read/write (MCP + CLI), rules, hybrid search, and a knowledge graph. External reference designs (card+graph marketing comps) suggest *additional* memory-layer ideas. This epic captures those ideas so we can **decide later** without confusing them with what Second Brain ships today, and without drifting into cloud-hosted memory products that conflict with local-first.

## Product truth today (do not re-claim as new)

Already shipped — marketing must keep describing these as current, not aspirational:

- Local files + desktop app; MCP/`brain` CLI; `RULES.md`
- Hybrid search (keyword + optional semantic) and knowledge graph (tags, wikilinks, similarity)
- Folders the owner chooses; agents file into that structure

## Candidate themes (decide per theme)

Each theme is independently accept/reject. None are committed.

### 1. Memory status (canonical / draft / deprecated)

**Idea:** Notes (or claims inside notes) carry an explicit lifecycle so agents prefer settled decisions over newer drafts or stale ones.

**Fits today?** Partial — owners can already express this with tags/folders/rules. First-class status would need data-model + agent tooling.

- [ ] Decision: accept / reject / defer
- [ ] If accept: ADR + data-model fields + agent-integration rules + UI affordances

### 2. Explicit multi-hop recall

**Idea:** A productised “follow connected memories beyond the closest match” path (seed → 1-hop → 2-hop) beyond today’s search + graph browsing.

**Fits today?** Partial — graph edges and semantic search already enable multi-hop *manually*. A dedicated recall UX/agent tool would be new.

- [ ] Decision: accept / reject / defer
- [ ] If accept: define agent tool vs desktop UX; acceptance tests for hop path

### 3. Richer automatic linking

**Idea:** Stronger “graph organises itself” suggestions (auto-edges, suggested wikilinks) while keeping owner folders.

**Fits today?** Partial — similarity edges exist; aggressive auto-organisation risks fighting owner structure.

- [ ] Decision: accept / reject / defer
- [ ] If accept: non-destructive suggestions only; owner confirm; rebuildable index

### 4. Structured day-capture pipelines

**Idea:** First-class “summarise last 24 hours from connected tools” flows (calendar, chat exports, etc.) beyond “agent uses whatever tools it has.”

**Fits today?** Agent-side possible now via MCP + rules; in-app connectors would be new scope (and often cloud).

- [ ] Decision: accept / reject / defer
- [ ] If accept: prefer agent-orchestrated capture over shipping connectors in-core

## Explicitly out (conflicts with local-first)

Do **not** fold these into this epic without a separate ADR that overturns [PRD §4.1](../prd.md):

- Hosted / Cloudflare / “one-click cloud memory”
- Replacing folders with folderless auto-organisation as the default model
- Requiring an account for the vault to work

## Goal (only if themes are accepted)

Ship one or more *optional*, local-first memory-depth features that make agent recall more reliable without turning Second Brain into a cloud memory SaaS.

## Deliverables (placeholder — fill when scheduled)

- ADR(s) for accepted themes
- data-model / agent-integration updates
- Core + surface (desktop/CLI/MCP) changes with colocated tests
- Marketing site copy updated only after behaviour ships

## Acceptance criteria

### Decision gate (before any coding)

- [ ] Each candidate theme above has an explicit accept / reject / defer
- [ ] Accepted themes have PRD section(s) or an ADR; rejected themes stay documented here as rejected
- [ ] No accepted theme requires cloud-hosted vault storage by default

### Functional (fill in when scheduled)

- [ ] _TBD per accepted theme_

### E2E validation (fill in when scheduled)

- [ ] _TBD per accepted theme_

## Notes

- Marketing site (`apps/web`) must continue to describe **shipped** behaviour only. Aspirational copy waits for this epic to land.
- Reference comps are inspiration for **diagram language** and **possible product depth**, not a requirements dump.
