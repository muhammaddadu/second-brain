# 0009. Ship a maintained in-vault agent guide (AGENTS.md) and an installable global agent skill

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

Beyond the planned MCP server (E6) and CLI (E5), the most direct way an AI agent works with the vault is the **filesystem itself** — reading and writing `.note.json` files in the folder. For that to be safe and useful, an agent needs the *contract*: the note envelope, folder/tag conventions, the reserved `.brain/`, `.order.json`, how to write without corrupting or clobbering, and the owner's `RULES.md`. Today nothing in the vault tells an agent any of this. Two needs follow: **(1)** leave those instructions in the folder so any agent that opens it is oriented, and **(2)** make the same knowledge available *globally* to an agent that isn't yet looking at a vault. Both must **stay current as the app gains features**, without overwriting anything the owner has hand-edited.

## Decision Drivers

1. **Meet agents where they are** — the guide should be a plain file in the folder (agents read files), not locked behind an API.
2. **Stay current, never clobber** — the app should refresh the guide as features ship, but an owner's edits are sacred.
3. **Global reach** — an agent should be able to learn the vault contract without a specific vault open (a reusable skill).
4. **One source of truth** — the in-vault guide and the global skill must not drift; author the contract once.
5. **No lock-in / honest boundaries** — the global mechanism is tool-specific (Claude Code skills today); keep it a thin, removable install.

## Decision

**(a)** Maintain an `AGENTS.md` at the vault root, authored by the app, describing the filesystem contract and pointing to `RULES.md`. It carries a marker line `<!-- second-brain:agent-guide vN managed:HASH -->`. On every vault open the app **syncs** it: absent → write; present-with-our-marker, older version, and body still hashing to the marker → refresh in place; **owner-edited (hash mismatch) or owner-authored (no marker) → leave untouched**. Lives in `packages/core` (`syncAgentGuide`) so CLI/MCP can reuse it.

**(b)** Package the *same* contract body as an installable **Claude Code skill** (`SKILL.md` with `name`/`description`/`version` frontmatter) that the desktop Settings screen writes to the user's global skills directory (`~/.claude/skills/second-brain-vault/`), with install / update (version-aware) / remove. One `agentGuideBody()` feeds both, so they can't drift (driver 4).

## Options Considered

- **Guide file only** — simplest; satisfies drivers 1–2 but not global reach (3). Rejected as insufficient for the owner's ask.
- **Guide file + installable skill (chosen)** — adds global reach with a thin, removable, version-aware install sharing the same body.
- **Skill only (no in-vault file)** — global reach without orienting an agent that just opens the folder; also couples the whole feature to one tool. Rejected: the in-folder file is the tool-agnostic baseline.
- *Update strategy:* auto-refresh-unless-edited (chosen) over prompt-every-time (nagging) or manual-only (drifts) — the marker's version+hash makes "did the owner touch it?" a reliable, cheap check.

## Consequences

- **Easier:** any agent opening the folder is oriented; the guide upgrades itself across releases; a Claude Code user installs the skill once and gets vault-aware agents everywhere; both come from one body.
- **Harder:** bumping `AGENT_GUIDE_VERSION` is now part of shipping an agent-facing change (the guide must describe reality); the skill install touches a path outside the app (`~/.claude/skills`) — kept explicit, removable, and read-only status-checked; the skill format is Claude Code-specific (other tools get the in-vault `AGENTS.md` instead).
- **Neutral / to watch:** owner-edit detection is hash-based on the body — a whitespace-only owner change is tolerated as "unmodified"; when E5/E6 land, the guide should point at the CLI/MCP for ranked retrieval.
- **Revisit if:** other agent runtimes want first-class skills (generalize the packaging), or the guide grows enough to warrant a `RULES.md`-style split.

## Links

- Where the guide sits: [data-model](../architecture/data-model.md) § The vault; owner rules: `RULES.md`
- Feeds into: [agent-integration](../guides/agent-integration.md) (MCP/CLI surfaces, E5/E6)
- Note format the contract describes: [ADR 0001](0001-blocknote-json-canonical-note-format.md); safe-write primitive: [ADR 0002](0002-vault-concurrency-atomic-write-rename.md)
