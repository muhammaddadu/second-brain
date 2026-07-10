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

## App hung on "Opening…" — bundled Electron main couldn't resolve the WASM SQLite module (2026-07-09)

**What went wrong:** After wiring the E4 search index into the main process, the built app stuck forever on the "Opening…" loading screen (worked fine in unit tests).
**Why:** `activateVault` opens the index, which does `createRequire(import.meta.url)('node-sqlite3-wasm')`. electron-vite **bundles** `packages/core` into `out/main/index.js`, so at runtime that require resolved from `apps/desktop/out/main/…` — where `node-sqlite3-wasm` (a dependency of *core*, symlinked only into `packages/core/node_modules`) was not reachable. The require threw, `activateVault` rejected, the `startup` IPC never resolved, and the renderer sat on its loading phase. Unit tests passed because there core runs from its own `node_modules`.
**Fix / Correct approach:** Add `node-sqlite3-wasm` as a **direct dependency of `apps/desktop`** (so pnpm symlinks it where the built main can resolve it) and mark it `external` in the electron-vite main `rollupOptions` (so the `.wasm` loads from `node_modules` at runtime instead of being bundled — same "don't bundle a Node-native lib into main" lesson as jsdom). General rule: when core is bundled into the Electron main, core's *runtime* deps (especially native/WASM ones loaded via `require`) must be resolvable and external from the app's perspective — verify with an actual built-app run/E2E, not just unit tests.

## Indexing 1000 notes took ~50s — missing a bulk transaction (2026-07-09)

**What went wrong:** The E4 1000-note perf test passed on *search* (<1 ms) but the test spent ~53s building the index — meaning the app would take ~50s to index a large vault on first open.
**Why:** `rebuildIndex`/`syncIndex` reindexed notes in a plain loop, so every `INSERT` was its own auto-committed transaction (a WAL fsync per statement × thousands of chunk/FTS inserts). SQLite is slow when each write commits separately.
**Fix / Correct approach:** Added `SearchIndex.transaction(fn)` (BEGIN … COMMIT, ROLLBACK on throw) and wrapped the bulk (re)index loops in it — one commit for the whole pass. Build time dropped from ~53s to ~0.4s. General rule: any loop doing many SQLite writes must run inside a single transaction; a "slow setup, fast query" perf test is a real signal, not just test overhead — the slow half is the app's indexing path.

## The jsdom-in-main crash came back through a new import path (2026-07-09)

**What went wrong:** Adding file import (`importFileAsNote`, statically importing core's `markdownToBlocks`) to the Electron main process made the built app fail to boot: `Cannot find module './xhr-sync-worker.js'` — the same jsdom failure recorded at E7.
**Why:** Main had always *avoided* importing core's Markdown conversion (the barrel export was tree-shaken away), so the constraint was invisible. The new feature pulled `@blocknote/server-util` → jsdom into the main bundle, and jsdom's relative `require` breaks once bundled. E2E caught it (all launches timed out at beforeAll).
**Fix / Correct approach:** Mark `@blocknote/server-util` external in the electron-vite main build and add it as a direct desktop dependency — same recipe as node-sqlite3-wasm/transformers/mammoth/pdf-parse. General rule: any core dependency that must load from `node_modules` at runtime (native, WASM, or relative-require-dependent like jsdom) goes on the main-build `external` list the moment main starts importing a core module that touches it; a boot-time E2E is the tripwire.

## v0.1.0 release assets split across two duplicate draft releases (2026-07-10)

**What went wrong:** The release matrix (`macos`/`windows`/`ubuntu`) each ran `electron-builder --publish always`, and the run produced **two** draft releases both tagged `v0.1.0` — one holding the Linux assets, the other holding mac + Windows + all the `latest*.yml` update manifests. Users could only download one platform, and auto-update was broken (its `latest*.yml` files were scattered across both drafts).
**Why:** electron-builder's GitHub publisher looks for an existing draft matching the tag and reuses it — but the three matrix jobs start concurrently, each finds no draft yet, and each creates its own. Classic check-then-create race with no shared lock.
**Fix / Correct approach:** Added a `prepare` job that runs first (`needs: prepare` on `build`) and creates the draft exactly once via `gh release create --draft` (idempotent: skips if the tag's release already exists). Every matrix job then finds and reuses that single draft. For the already-published v0.1.0, consolidated by downloading the Linux assets and re-uploading them onto the fuller draft, then deleting the duplicate. General rule: when a fan-out matrix all publishes to one shared target keyed by a name/tag, pre-create the target in a single upstream job — don't rely on each parallel job to create-if-missing.

## Watcher "live" tests flaky in CI — native FS events, not a timing sleep (2026-07-10)

**What went wrong:** `watcher.test.ts > watchVault (live) > emits an event…` passed locally but intermittently failed in GitHub CI (timed out waiting for the change event). First fix — replacing a fixed 300ms attach sleep with an awaited chokidar `ready` promise — was a real improvement (and ~10× faster) but did **not** stop the CI failures.
**Why:** The remaining flakiness wasn't a timing race at all: CI's containerized filesystem doesn't reliably deliver native inotify/fsevents to chokidar, so the `add` event for the atomically-renamed note sometimes never arrived within the timeout. No amount of waiting fixes a missing event.
**Fix / Correct approach:** Added an opt-in `usePolling` option to `watchVault` (a genuine production fallback for network/virtual mounts, which have the same problem) and enabled it in the two live tests. Polling exercises the same forwarding + reserved-path filtering with a dependable event source. General rule: when a test depends on OS-level filesystem notifications, "flaky only in CI" points at the event source (native watchers are unreliable in containers/networked FS), not at your sleeps — switch the integration test to polling rather than piling on timeout.
