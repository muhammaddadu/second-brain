# E10 — Deeper memory semantics (proposed)

> **This doc owns:** a **proposed** post-v1 epic distilled from external marketing-reference concepts. **It is not scheduled** (except themes that graduated — see below). **Index:** [epics](index.md). **Current product truth:** [value-proposition](../value-proposition.md), [PRD](../prd.md).

**Status:** Proposed (partial graduation) · **Depends on:** E4, E6, E9 (if pursued) · **PRD:** none yet — would need new sections if remaining themes are accepted

## Why this exists

Shipped epics (E0–E9) already deliver a local vault with agent read/write (MCP + CLI), rules, hybrid search, and a knowledge graph. External reference designs suggested *additional* memory-layer ideas. This epic parks those ideas so we can **decide later** without confusing them with what Second Brain ships today.

## Graduated

| Theme | Decision | Where |
|-------|----------|--------|
| Explicit multi-hop recall | **Accepted → shipped** | [E11 — Multi-hop recall](E11-multi-hop-recall.md) |

## Product truth today (do not re-claim as new)

Already shipped — marketing must keep describing these as current, not aspirational:

- Local files + desktop app; MCP/`brain` CLI; `RULES.md`
- Hybrid search (keyword + optional semantic) and knowledge graph (tags, wikilinks, similarity)
- Multi-hop recall from a seed note (CLI / MCP / Related panel) — [E11](E11-multi-hop-recall.md)
- Folders the owner chooses; agents file into that structure

## Candidate themes (decide per theme)

Each remaining theme is independently accept/reject. None of these are committed.

### 1. Memory status (canonical / draft / deprecated)

**Idea:** Notes (or claims inside notes) carry an explicit lifecycle so agents prefer settled decisions over newer drafts or stale ones.

**Fits today?** Partial — owners can already express this with tags/folders/rules. First-class status would need data-model + agent tooling.

- [ ] Decision: accept / reject / defer
- [ ] If accept: ADR + data-model fields + agent-integration rules + UI affordances

### 2. Explicit multi-hop recall

**Decision:** Accepted — implemented as [E11](E11-multi-hop-recall.md).

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

## Goal (only if remaining themes are accepted)

Ship one or more *optional*, local-first memory-depth features that make agent recall more reliable without turning Second Brain into a cloud memory SaaS.

## Acceptance criteria

### Decision gate (before any coding)

- [x] Multi-hop recall decided (accepted → E11)
- [ ] Each remaining candidate theme has an explicit accept / reject / defer
- [ ] Accepted themes have PRD section(s) or an ADR; rejected themes stay documented here as rejected
- [ ] No accepted theme requires cloud-hosted vault storage by default

## Notes

- Marketing site (`apps/web`) describes **shipped** behaviour only.
- Reference comps remain inspiration for diagram language and possible product depth, not a requirements dump.
