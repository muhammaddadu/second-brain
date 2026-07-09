# LEARNINGS.md

Append-only log of mistakes made in this project and how they were corrected. Review before starting work; append when you make and fix a mistake (format in `AGENTS.md` → Learnings Protocol). Never rewrite or delete entries.

<!-- EXAMPLE FORMAT (keep as reference until the first real entry):

## Docs went stale within the same session (YYYY-MM-DD)

**What went wrong:** A doc still described the old tooling after the change had landed.
**Why:** The doc was written before the change and not revisited when it landed.
**Fix / Correct approach:** Update docs in the same change as the code they describe; before finishing any change, grep the docs for claims it invalidates.

-->

## E2E tests shared one Electron window and leaked UI state (2026-07-09)

**What went wrong:** In the desktop Playwright suite, tests reuse a single launched app (one `beforeAll`). A later test did `getByRole('button', {name: 'Diagrams'}).click()` to expand a folder, but a previous test had already expanded it — so the click *collapsed* it and the note underneath was gone, failing the test.
**Why:** Folder expand/collapse is renderer session state that persists across tests in the same window; treating a folder click as "expand" assumed a fresh UI each test.
**Fix / Correct approach:** Made navigation idempotent — an `openNote(folder, note)` helper that expands only when `aria-expanded !== 'true'`. When desktop E2E shares one app instance, never assume UI state resets between tests; drive toward the desired state (check-then-act) rather than toggling.

## Default vault location was ~/Documents — an iCloud-synced folder (2026-07-09)

**What went wrong:** The first-run "create a new vault" default was `~/Documents/Second Brain`. On macOS with iCloud "Desktop & Documents" sync enabled, the cloud daemon would fight the app's atomic write-then-rename + watcher (ADR 0002), could evict files to `.icloud` placeholder stubs, and would sync the SQLite index/WAL (E4) — a corruption risk. The owner caught it before real use.
**Why:** `~/Documents` felt like the conventional home for user documents, without accounting for cloud-sync side effects on a files-first, watcher-driven, local-index app.
**Fix / Correct approach:** Default new vaults to the home root (`~/Second Brain`, via `app.getPath('home')`), which isn't iCloud-synced by default; owners can still pick any folder. Rationale documented in `ux/index.md` and the `suggestedNewVaultPath` comment. General rule: for a files-first app with a live watcher and an on-disk index, never default storage into a cloud-synced location (Documents/Desktop/OneDrive/Dropbox); prefer a non-synced path and let the user opt in.
