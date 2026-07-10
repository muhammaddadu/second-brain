# Building & releasing

> **This doc owns:** how to produce installable app builds per platform and cut a release. **Decision + rationale:** [ADR 0011](../adr/0011-packaging-and-distribution-electron-builder.md). **To run from source instead, see** [getting-started](getting-started.md).

The desktop app is packaged with **electron-builder** from electron-vite's `out/`. You can build unsigned installers with no setup; signing/notarization are opt-in via environment variables.

## Build installers locally

From the repo root (or `apps/desktop`):

| Command | Produces |
|---------|----------|
| `pnpm dist` | installers for the **current** OS (into `apps/desktop/dist/`) |
| `pnpm --filter @brain/desktop dist:mac` | macOS `.dmg` + `.zip` (arm64 + x64) |
| `pnpm --filter @brain/desktop dist:win` | Windows `.exe` (NSIS installer) |
| `pnpm --filter @brain/desktop dist:linux` | Linux `.AppImage` + `.deb` |
| `pnpm --filter @brain/desktop dist:dir` | an **unpacked** app (no installer) — fastest way to smoke-test a packaged build |

You can only build a platform's installer **on that platform** (macOS can also build for Linux via Docker, but the simple rule is: build each OS on that OS — that's what CI does).

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

`/.github/workflows/release.yml` builds all three OSes on a version tag and uploads the artifacts to a GitHub Release (draft).

1. Bump the version in `apps/desktop/package.json`.
2. Set `publish.owner` in `apps/desktop/electron-builder.yml` to your GitHub org/user (currently `REPLACE_ME`).
3. Add signing secrets to the repo (Settings → Secrets → Actions) matching the env vars above; unsigned still works without them.
4. Tag and push: `git tag v0.1.0 && git push --tags`.
5. The workflow builds macOS/Windows/Linux and attaches installers to a draft release; review and publish.

## Before first public release — checklist

- [ ] Replace the placeholder `apps/desktop/build/icon.png` with a real 1024×1024 brand icon.
- [ ] Set `publish.owner` (and `homepage`/`author` in `apps/desktop/package.json`) to real values.
- [ ] Add signing secrets so users don't see security warnings.
- [ ] Decide on auto-update: wire `electron-updater` against the GitHub `publish` target.
