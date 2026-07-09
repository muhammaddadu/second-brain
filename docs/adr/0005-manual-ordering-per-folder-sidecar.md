# 0005. Persist manual folder/note order in a per-folder `.order.json` sidecar

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)

## Context

The tree supports dragging a note or folder to sort it (drag-to-move landed first; this ADR is about the *reorder* half). A filesystem directory has no inherent child order — `readdir` order is not stable and we deliberately present a default folders-first, alphabetical sort. So a user's manual arrangement is **un-derivable state**: it cannot be reconstructed from the files, the note contents, or the derived index.

That collides with the architecture's non-negotiables ([AGENTS.md](../../AGENTS.md)): files on disk are the single source of truth; the derived index must be rebuildable and **never** the sole home of a fact; whole-vault Markdown export must keep the vault usable with the app uninstalled. Manual order must therefore live somewhere durable — but it is a *presentation preference*, not note content: export flattens to files, where order is irrelevant, so losing custom order on export is acceptable. The question is purely **where on disk** the order is recorded.

## Decision Drivers

1. **Durable, not index-only** — order is un-derivable, so it must be a real persisted file, not a fact that vanishes when the derived index is rebuilt.
2. **Files-first, documented, git-diffable** — no opaque blob; a human (or agent) can read and edit the order.
3. **Survives reorganization** — moving/copying a folder should carry (or at least not silently corrupt) its order.
4. **Clean vault / low clutter** — the owner values a tidy vault; ordering must not churn filenames or bury real notes under bookkeeping.
5. **Degrades gracefully** — a missing, partial, or malformed order must fall back to the default sort, never break the tree or lose a note.

## Options Considered

### Option 1: A per-folder `.order.json` sidecar inside each ordered folder (chosen)

Each folder that has a manual order contains a `.order.json` — a JSON array of its children's on-disk entry names in display order (a folder's dir name, a note's `.note.json` filename). The tree reads it and lists named children first in that order, then everything unlisted in the default folders-first/alpha order.

- Good: order is co-located with the content it orders, so it travels with the folder on move/copy for free (driver 3) — `moveFolder` already moves the whole directory.
- Good: plain documented JSON, git-diffable and hand-editable (driver 2); advisory by construction — unlisted/missing/malformed → default sort (driver 5).
- Good: durable vault file, not the disposable index (driver 1).
- Bad: adds one hidden file to every folder the user has hand-sorted (driver 4 cost) — mitigated by it being a dotfile the tree never surfaces.
- Bad: a stale entry (a note deleted outside the app) lingers in the array — harmless (ignored on read), cleaned lazily on the next reorder.

### Option 2: A single vault-level order manifest under `.brain/`

One `.brain/order.json` mapping each folder path to its ordered child names.

- Good: user folders stay pristine — zero extra files among the notes (driver 4).
- Bad: order for `Journal/` no longer lives with `Journal/` (weakens driver 2/3); a folder moved *out* of the vault loses its order, and every folder rename/move/delete must remap central paths (we have the remap logic, but it is now load-bearing for correctness, not just UI state).
- Bad: a single hot file is a merge-conflict and write-contention point as the vault and agents both reorder.

### Option 3: Encode order in numeric filename prefixes (`001-Note.note.json`)

Order *is* the filesystem via sortable name prefixes.

- Good: no extra files; order is visible and obvious in any file browser and in git.
- Bad: every reorder renames files (driver 4 violated hard) — churns titles, breaks any path/links, and fights the title→filename convention; a single insert can renumber a whole folder. Rejected as user-hostile for a "clean vault."

## Decision & Rationale

Chosen: **Option 1** — a per-folder `.order.json` sidecar.

It is the only option where order lives *with* the content it governs, so the existing directory-move primitive carries it correctly (driver 3) with no central bookkeeping to keep in sync, while staying a durable, documented, degrade-gracefully file (drivers 1, 2, 5). Its one real cost — a hidden file per hand-sorted folder — is acceptable because it is a dotfile the tree never lists, so the vault still *reads* clean (driver 4).

- Option 2 rejected because divorcing order from its folder makes folder moves/renames a correctness problem and concentrates write contention in one file, for only a cosmetic clutter win.
- Option 3 rejected because renaming files to reorder is destructive to titles/links and churns git — the opposite of a clean, files-first vault.

## Consequences

- **Easier:** reorder is a single small write (`setFolderOrder` → atomic write of `.order.json`), no file moves; order survives folder move/copy and a vault clone; an agent can reorder by writing the same documented array.
- **Harder:** the tree walk now reads one extra file per directory (cheap, and skipped when absent); `.order.json` must be documented in [data-model](../architecture/data-model.md) and excluded everywhere notes are enumerated; reorder writes are advisory so callers needn't list every child, but must not assume the array is exhaustive.
- **Neutral / to watch:** stale entries (deleted-outside-the-app children) are tolerated and pruned lazily on the next reorder; the watcher fires on `.order.json` writes and simply refreshes the tree (idempotent — same order re-read). Manual order is intentionally **not** preserved by Markdown export.
- **Revisit if:** the per-directory read becomes a measurable cost on very large vaults (cache order in the derived index as an optimization — still rebuildable from the sidecars, which remain the source of truth), or cross-vault ordering semantics are ever needed.

## Links

- Storage format: [data-model](../architecture/data-model.md) § Manual order
- Feature epic: [E3 — File actions & live vault updates](../product/epics/E3-file-actions.md)
- Non-negotiables it honors: [AGENTS.md](../../AGENTS.md) § Architecture Rules
- Builds on the atomic-write primitive: [ADR 0002](0002-vault-concurrency-atomic-write-rename.md)
