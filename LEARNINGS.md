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
