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

## Signing & notarization (macOS)

An **unsigned or signed-but-un-notarized** macOS build that a user *downloads* (so it carries a `com.apple.quarantine` flag) is blocked by Gatekeeper — on Apple Silicon with the blunt **"Second Brain is damaged and can't be opened"** dialog. It isn't damaged; Gatekeeper just can't verify it. Two things fix this together:

1. **Code signing** with a *Developer ID Application* certificate (proves who built it).
2. **Notarization** — Apple scans the signed app and issues a ticket that's stapled into the build. **Signing alone is not enough**; notarization is what clears the "damaged" block for downloaded builds.

`hardenedRuntime` and the entitlements needed for both are already set in [`electron-builder.config.cjs`](../../apps/desktop/electron-builder.config.cjs). The **decision and rationale** for the approach below are in [ADR 0012](../adr/0012-macos-code-signing-fastlane-match-api-key.md). The short version:

- **Notarization** uses an **App Store Connect API key** (`.p8`) — revocable, no 2FA, the recommended CI method.
- The **signing certificate** is managed by **[fastlane match](https://docs.fastlane.tools/actions/match/)**: it lives AES-encrypted in a *separate private git repo*, never in this one. `match` provisions it into the build keychain; electron-builder auto-discovers the identity.
- Signing engages only when `APPLE_API_KEY` is set; otherwise builds stay unsigned (and installable), so no Apple account is needed to build.

### One-time setup

You need an **Apple Developer Program** membership. Then:

1. **App Store Connect Team API key.** [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) → generate a **Team key** with **Admin** access (Admin is required to *create* a Developer ID cert). Download the `.p8` **once** (you can't re-download it), and note the **Key ID** and **Issuer ID**. Find your 10-char **Team ID** on the [membership page](https://developer.apple.com/account).
2. **A private certificate repo.** Create an empty **private** GitHub repo (e.g. `second-brain-certs`) — this is match's encrypted store. Pick a strong **match passphrase** (`MATCH_PASSWORD`); it encrypts everything in that repo.
3. **Install the Ruby tooling** (only needed for signing): `bundle install` from the repo root (uses the [`Gemfile`](../../Gemfile)).

### Build a signed + notarized installer locally

Point the tooling at your credentials, then run one lane to provision the cert and build:

```sh
export APPLE_API_KEY=/abs/path/AuthKey_XXXXXXXX.p8   # path to the .p8 from step 1
export APPLE_API_KEY_ID=XXXXXXXXXX                   # Key ID
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-…         # Issuer ID (UUID)
export APPLE_TEAM_ID=XXXXXXXXXX                      # 10-char Team ID
export MATCH_GIT_URL=git@github.com:you/second-brain-certs.git
export MATCH_PASSWORD=…                              # the match passphrase from step 2

bundle exec fastlane certs                           # creates the Developer ID cert (first run) + stores it encrypted
pnpm --filter @brain/desktop dist:mac                # signs (keychain identity) + notarizes
```

The first `fastlane certs` run creates the Developer ID Application certificate and pushes it, encrypted, to your certs repo. Notarization adds a few minutes (Apple processes the upload). Verify the result:

```sh
# Should report "accepted" and "source=Notarized Developer ID"
spctl -a -vvv --type install "apps/desktop/dist/production/mac-arm64/Second Brain.app"
xcrun stapler validate "apps/desktop/dist/production/mac-arm64/Second Brain.app"
```

A correctly notarized `.dmg` opens on any Mac with no security dialog — no `xattr` workaround needed.

> If Apple rejects Developer ID cert *creation* via the API key (a known account-dependent limitation), run the creation once with a web session instead — `bundle exec fastlane match developer_id` and sign in when prompted — then CI's read-only fetch works with the API key as normal.

### Windows / Linux

Windows Authenticode signing (to avoid the SmartScreen "unknown publisher" prompt) needs a separate code-signing certificate — not set up yet. Linux AppImage/deb are not signed.

## Cutting a release (CI)

`/.github/workflows/release.yml` builds all three OSes and uploads the artifacts to a GitHub Release (draft). It picks the environment automatically: a `-beta.` tag builds **beta**, any other `v*` tag builds **production**, and a manual run (workflow_dispatch) takes an environment input.

A `prepare` job creates the draft **once** before the three OS builds fan out; each build then reuses that draft. This is deliberate — without it the matrix jobs race to create the draft and end up splitting assets across duplicate `v*` drafts, which breaks auto-update (every `latest*.yml` must sit on one release).

1. Bump the version in `apps/desktop/package.json`.
2. `publish.owner`/`repo` in `apps/desktop/electron-builder.config.cjs` point at `muhammaddadu/second-brain` — auto-update pulls releases from there.
3. Add the macOS signing secrets under *Settings → Secrets and variables → Actions* (unsigned releases still work without them). The release workflow reads exactly these:

   | Secret | Value |
   |--------|-------|
   | `APPLE_API_KEY_BASE64` | base64 of the `.p8` — `base64 -i AuthKey_XXXX.p8 \| pbcopy` (also the flag that turns signing on in CI) |
   | `APPLE_API_KEY_ID` | the key's **Key ID** |
   | `APPLE_API_ISSUER` | the **Issuer ID** (UUID) |
   | `APPLE_TEAM_ID` | 10-char **Team ID** |
   | `MATCH_GIT_URL` | SSH URL of your private certs repo (e.g. `git@github.com:you/mobile-certs.git`) |
   | `MATCH_PASSWORD` | the match passphrase that decrypts that repo |
   | `MATCH_DEPLOY_KEY` | private half of a **read-only SSH deploy key** on the certs repo, so CI can clone it. Generate with `ssh-keygen -t ed25519`, add the public half via `gh repo deploy-key add key.pub --repo you/mobile-certs` (no `--allow-write`), store the private half here. Scoped to one repo and revocable. |
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
- [ ] Add macOS signing + notarization secrets so downloaded builds aren't blocked as "damaged" (see [Signing & notarization](#signing--notarization-macos)). Unsigned still installs, but only after an `xattr -dr com.apple.quarantine` workaround.
