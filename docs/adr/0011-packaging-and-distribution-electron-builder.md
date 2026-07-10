# 0011. Package and distribute with electron-builder (per-OS installers, signing credential-gated)

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** Muhammad Dadu (owner)

## Context

The app has shipped all planned epics; it needs to leave the dev machine as something a non-technical owner can download and install on macOS, Windows, or Linux. electron-vite already builds the app to `out/`; what's missing is turning that into signed, installable artifacts per platform, plus a repeatable release path. The vault's non-negotiables don't bear on packaging, but two practical constraints do: the app pulls in **native/WASM** modules (`node-sqlite3-wasm`, `onnxruntime-node`/`sharp` via the built-in embedder) that must load at runtime, and it's a **pnpm workspace** whose `@brain/core`/`@brain/cli` deps are symlinks — both are historically where Electron packaging breaks.

## Decision Drivers

1. **All three desktop OSes** from one config, ideally one CI run.
2. **Anyone can build** — an unsigned local build must work without secrets; signing is an add-on, not a prerequisite.
3. **Correct native/WASM + workspace-dep bundling** — the packaged app must actually boot (no missing-module crashes).
4. **A path to auto-update** later without re-architecting.
5. Minimal new tooling; stay close to what electron-vite expects.

## Options Considered

### Option 1: electron-builder (chosen)

- Good: first-class multi-target (dmg/zip, nsis, AppImage/deb) from one `electron-builder.yml`; built-in code-sign + notarize hooks that **no-op when credentials are absent** (driver 2); `asarUnpack` cleanly handles native/WASM (driver 3); dereferences pnpm workspace symlinks so `@brain/core`/`@brain/cli` land in the asar (verified); `electron-updater` gives auto-update on the same config (driver 4).
- Bad: config-heavy; the full bundle is large (~360 MB app.asar) because the built-in embedder drags in onnxruntime + transformers. Acceptable now; a "slim build" that omits the on-device model is future work.

### Option 2: Electron Forge

- Good: official, good DX, plugin for Vite.
- Bad: its Vite plugin expects Forge's own build flow, not electron-vite's `out/`; migrating the build to Forge is churn against driver 5, and multi-arch/notarize ergonomics are weaker than electron-builder's today. Rejected.

### Option 3: Hand-rolled (electron-packager + platform tools)

- Good: full control, no framework.
- Bad: we'd re-implement dmg/nsis/AppImage creation, signing, and asar handling — exactly the work drivers 1–3 want off the shelf. Rejected.

## Decision

Use **electron-builder**, configured in `apps/desktop/electron-builder.yml`, packaging electron-vite's `out/`. Targets: macOS dmg+zip (arm64+x64), Windows nsis (x64+arm64), Linux AppImage+deb. Native/WASM modules are `asarUnpack`ed. Signing/notarization read standard env vars (`CSC_LINK`/`CSC_KEY_PASSWORD`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, Windows cert vars) and are skipped when unset — an unsigned but installable build. `publish` points at GitHub Releases so `electron-updater` can be added later. A GitHub Actions matrix builds all three OSes on tag.

## Consequences

- `pnpm dist` (or `dist:mac|win|linux`) produces installers locally; unsigned builds install with an OS "unidentified developer" warning until the owner supplies certs (documented in [building-and-releasing](../guides/building-and-releasing.md)).
- The `chokidar` runtime dep (previously core-only) is now also a desktop dep so it's in the packaged tree; any future core runtime dep must be added to the desktop package too, or packaging will miss it. (A hoisted node-linker would remove this footgun but changes the whole workspace install — not worth it yet.)
- Installer size is large; revisit a slim/no-model build if download size becomes a complaint.
- Icons are a placeholder (`build/icon.png`); a real brand icon should replace it before public release.
- **Revisit if:** we adopt auto-update (wire `electron-updater` + a real `publish` owner), or the workspace grows enough that manual dep-mirroring into desktop becomes error-prone (then switch to `node-linker=hoisted`).
