# Building & releasing

> **This doc owns:** how to produce installable app builds per platform and cut a release. **Decision + rationale:** [ADR 0011](../adr/0011-packaging-and-distribution-electron-builder.md). **To run from source instead, see** [getting-started](getting-started.md).

The desktop app is packaged with **electron-builder** from electron-vite's `out/`. You can build unsigned installers with no setup; signing/notarization are opt-in via environment variables.

## Build environments

The app builds in three flavours, defined once in [`apps/desktop/build/environments.cjs`](../../apps/desktop/build/environments.cjs). Each has a distinct **appId** and **product name**, so a Dev or Beta build installs *side by side* with production and keeps its own settings/recent-vaults (userData is keyed by appId). Non-production builds show a small **env badge** in the header.

| Env | appId | Product name | Update channel |
|-----|-------|--------------|----------------|
| `production` | `com.secondbrain.app` | Second Brain | `latest` |
| `beta` | `com.secondbrain.app.beta` | Second Brain Beta | `beta` |
| `development` | `com.secondbrain.app.dev` | Second Brain Dev | `dev` |

The environment is selected by the `BUILD_ENV` variable (default `production`); it's baked into the app at build time (`__APP_ENV__`) and drives the packaging appId/name/channel. **Add an environment = add one entry** to `environments.cjs`; nothing else changes.

## Build installers locally

From the repo root (or `apps/desktop`):

| Command | Produces |
|---------|----------|
| `pnpm dist` | production installers for the **current** OS (into `apps/desktop/dist/production/`) |
| `pnpm --filter @brain/desktop dist:beta` | **Beta** installers (into `dist/beta/`) |
| `pnpm --filter @brain/desktop dist:dev` | **Dev** installers (into `dist/development/`) |
| `pnpm --filter @brain/desktop dist:mac` \| `dist:win` \| `dist:linux` | production installers for one OS |
| `pnpm --filter @brain/desktop dist:dir` | an **unpacked** app (no installer) — fastest smoke test; honours `BUILD_ENV` (e.g. `BUILD_ENV=beta pnpm --filter @brain/desktop dist:dir`) |

Each environment's artifacts go to `apps/desktop/dist/<env>/` and are named `…-<version>-<env>-<arch>.<ext>`, so flavours never collide. You can only build a platform's installer **on that platform** (that's what CI does).

**Installer size:** the build is large (~300–400 MB) because the built-in on-device embedding model pulls in `onnxruntime` + Transformers.js. That's the cost of offline semantic search. A future "slim" build could omit the on-device model (semantic search then requires an external provider).

## Signing & notarization (optional, per platform)

Unsigned builds install fine but show an "unidentified developer" warning. To ship without warnings, set these before running `dist` — electron-builder picks them up automatically and skips signing when they're absent:

**macOS** (needs an Apple Developer account):
```sh
export CSC_LINK=/path/to/DeveloperIDApplication.p12   # or base64 in CSC_LINK
export CSC_KEY_PASSWORD=…                              # the .p12 password
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=…                   # appleid.apple.com → app-specific password
export APPLE_TEAM_ID=XXXXXXXXXX
```

**Windows** (needs a code-signing certificate):
```sh
export CSC_LINK=/path/to/windows-cert.pfx
export CSC_KEY_PASSWORD=…
```

Linux AppImage/deb are not signed.

## Cutting a release (CI)

`/.github/workflows/release.yml` builds all three OSes and uploads the artifacts to a GitHub Release (draft). It picks the environment automatically: a `-beta.` tag builds **beta**, any other `v*` tag builds **production**, and a manual run (workflow_dispatch) takes an environment input.

A `prepare` job creates the draft **once** before the three OS builds fan out; each build then reuses that draft. This is deliberate — without it the matrix jobs race to create the draft and end up splitting assets across duplicate `v*` drafts, which breaks auto-update (every `latest*.yml` must sit on one release).

1. Bump the version in `apps/desktop/package.json`.
2. `publish.owner`/`repo` in `apps/desktop/electron-builder.config.cjs` point at `muhammaddadu/second-brain` — auto-update pulls releases from there.
3. Add signing secrets to the repo (Settings → Secrets → Actions) matching the env vars above; unsigned still works without them.
4. Tag and push: `git tag v0.1.0 && git push --tags` (production), or `git tag v0.1.0-beta.1` for a beta build.
5. The workflow builds macOS/Windows/Linux and attaches installers to a draft release; review and publish.

## Auto-update

Packaged builds check GitHub Releases for their environment's channel (`latest`/`beta`/`dev`) via `electron-updater`, download a newer version in the background, and show a "Restart to update" toast — no surprise relaunch (it otherwise installs on next quit). Publishing happens in CI: the release workflow runs `electron-builder --publish always`, which uploads the installers **and** the channel manifest (`latest-mac.yml`, etc.) that the updater reads. Manual "Check for Updates…" lives in the app menu.


## Marketing site (GitHub Pages)

The product website (`apps/web`) deploys to [https://muhammaddadu.github.io/second-brain/](https://muhammaddadu.github.io/second-brain/) via [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml). Setup and local production builds are documented in [`apps/web/README.md`](../../apps/web/README.md). Product markdown docs stay in `docs/` — Pages is **not** sourced from that folder.

## Before first public release — checklist

- [ ] Replace the placeholder `apps/desktop/build/icon.png` with a real 1024×1024 brand icon.
- [x] `publish.owner`/`repo` set to `muhammaddadu/second-brain`; `homepage`/`author` filled in.
- [x] GitHub-based auto-update wired (`electron-updater`) with a per-env channel.
- [ ] Add signing secrets so users don't see security warnings (unsigned still installs, with a warning).
