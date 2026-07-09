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

## Mermaid leaked a "Syntax error" bomb element into `document.body` (2026-07-09)

**What went wrong:** Rendering an invalid Mermaid diagram left a stray "Syntax error in text / mermaid version …" element floating over the whole app; repeated failed renders accumulated more.
**Why:** `mermaid.render(id, source)` appends a temporary container (`d${id}`) to `document.body` to measure/lay out the SVG, and removes it on success — but on a parse error it throws *before* the cleanup, orphaning the element. Our renderer caught the error but never removed the leftover node.
**Fix / Correct approach:** Clean up in a `finally` after `mermaid.render` — remove `document.getElementById('d'+id)` and `getElementById(id)` regardless of success/failure. E2E now asserts no `[id^="dbrain-mermaid"]` element survives a failed render. General rule: when a third-party lib mutates the global DOM as a side effect, assume its error path skips its own cleanup and reclaim the nodes yourself.

## Drag-to-move never fired because a guard read a ref that had just been nulled (2026-07-09)

**What went wrong:** Dropping a note/folder onto a target did nothing — `move()` was never called, with no error.
**Why:** `dropInto()` set `draggingRef.current = null` (drag-end cleanup) *before* calling `canDropInto(target)`, and `canDropInto` re-read the dragged node from that same ref — so it always saw `null` and returned `false`. The local `dragged` variable held the value, but the guard ignored it.
**Fix / Correct approach:** Pass the dragged node into `canDropInto(dragged, target)` explicitly instead of reading the ref inside it; null the ref only after the decision. General rule: a predicate must take its inputs as parameters, not re-read mutable state the caller is in the middle of tearing down.

## Position-aware drop E2E fired the wrong intent because dispatched drop events had no clientY (2026-07-09)

**What went wrong:** After making the folder-tree drop position-aware (row middle = move-into, edges = reorder), the "drag into folder" E2E started failing — the drop landed as a *reorder* instead of a *move*.
**Why:** The tree computes intent from the pointer's vertical fraction of the target row (`(clientY - rect.top) / rect.height`). The E2E dispatched `drop` via `dispatchEvent` without a `clientY`, so it defaulted to `0`; with a row ~100px down the sidebar that yields a large *negative* fraction, which read as "top edge" → reorder-before. It looked like a code bug but was a test that didn't supply the coordinate the feature depends on.
**Fix / Correct approach:** For synthetic HTML5-DnD tests of position-aware drops, get the target's `boundingBox()` and pass an explicit `clientY` (row middle for into, `y + height*0.1` for before) to both `dragover` and `drop`. General rule: when behavior depends on pointer coordinates, a `dispatchEvent` test must set them — an omitted `clientY`/`clientX` is `0`, not "the middle".
