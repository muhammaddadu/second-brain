# 0012. Sign macOS builds with fastlane match + notarize with an App Store Connect API key

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** Muhammad Dadu (owner)

## Context

[ADR 0011](0011-packaging-and-distribution-electron-builder.md) left signing "credential-gated": unsigned builds work, and signing is an add-on to enable later. That later is now. A *downloaded* unsigned (or signed-but-un-notarized) macOS build is blocked by Gatekeeper on Apple Silicon with **"'Second Brain' is damaged and can't be opened. You should move it to the Bin."** — the single scariest first impression the app can make. Clearing it requires two things together: signing with a **Developer ID Application** certificate **and** **notarizing** with Apple (signing alone is not enough).

The owner wanted this automated, CI-friendly, and safe — specifically, credentials that *can't be permanently stolen*. Two credentials are in play: the signing **certificate** (a private key that must exist somewhere — no cloud service signs a Developer ID app for electron-builder on our behalf) and the **notarization** credential.

## Decision Drivers

1. **Automated + CI-friendly** — a tagged release in GitHub Actions produces signed, notarized installers with no interactive step.
2. **Recoverable if leaked** — a credential exposure must be fixable by revoke-and-reissue, not a catastrophe. No account password in CI.
3. **Keep unsigned builds working** — driver 2 of ADR 0011 still holds: anyone can build an unsigned installer with no Apple credentials.
4. **Minimal secret sprawl in this repo** — no certificate or key material committed here.

## Options Considered

### Notarization credential

- **App Store Connect API key (`.p8`) — chosen.** Doesn't expire, needs no 2FA (so it works headless in CI), and is **revocable** — the key property for driver 2. electron-builder consumes it via `APPLE_API_KEY` (path to the `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`.
- Apple ID + app-specific password. Rejected: ties CI to the owner's Apple ID, prompts for 2FA in some flows, and a leak exposes an account-level credential rather than a scoped, revocable token.

### Signing certificate management

- **fastlane match (`type developer_id`), git storage — chosen.** The cert + private key live **AES-encrypted in a separate private git repo** (decryptable only with `MATCH_PASSWORD`), never in this repo or in a plaintext CI secret. CI fetches it **read-only** into an ephemeral keychain; electron-builder auto-discovers the identity. Rotating or revoking is a `match` command.
- Raw `.p12` as a base64 GitHub secret. Simpler, and still supported by the config as a fallback (`CSC_LINK`), but the private key then sits decrypted-at-use in a CI secret with no shared, versioned store — weaker on drivers 2 and 4. Rejected as the primary path.
- Hardware-backed / cloud signing (HSM, Xcode Cloud). Strongest isolation, but no practical integration with electron-builder on GitHub Actions. Rejected as disproportionate for a solo project.

## Decision

Sign with a **Developer ID Application** certificate managed by **fastlane match** (`type developer_id`, git storage), and **notarize with an App Store Connect Team API key**. Concretely:

- Ruby tooling (`Gemfile`, `fastlane/Matchfile`, `fastlane/Fastfile`) adds a `certs` lane that authenticates with the API key and runs `match` — creating the cert locally on first run, fetching it **read-only** in CI.
- `apps/desktop/electron-builder.config.cjs` treats the presence of `APPLE_API_KEY` (or a `CSC_LINK` fallback) as the signal to sign, and enables `notarize` only when the API key **and** `APPLE_TEAM_ID` are present. With neither, `identity: null` + `notarize: false` — an unsigned but installable build (driver 3).
- The release workflow gains macOS-only steps (Ruby, `fastlane certs`) gated on the signing secret being present; other OSes and credential-less runs are unaffected.

Cert **creation** requires a **Team** API key with Admin access and is a one-time local action; if the API cannot mint a Developer ID cert, the fallback is a one-time web-session `match` run. CI never creates certs.

## Consequences

- Ruby/fastlane is now a build-time dependency **for signing only** — not for building unsigned installers, running the app, or any test. New contributors are unaffected unless they sign.
- A **second private repo** (the match certificate store) and a **read-only SSH deploy key** for CI to read it become part of the release infrastructure, documented in [building-and-releasing](../guides/building-and-releasing.md). Losing `MATCH_PASSWORD` means re-provisioning the cert.
- Secrets required in GitHub Actions: `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`, `MATCH_GIT_URL`, `MATCH_PASSWORD`, `MATCH_DEPLOY_KEY`. All are revocable/reissuable (driver 2) — the deploy key is scoped to the one certs repo.
- Developer ID cert **creation** cannot use the API key (Apple requires an interactive Account-Holder login); it is a one-time `create_cert` lane run locally. CI only ever fetches read-only, which the API key + deploy key handle headlessly.
- Windows Authenticode signing is still unaddressed; its SmartScreen warning remains until a separate cert is set up.
- **Revisit if:** Apple ships practical cloud signing for Developer ID, the workspace adopts hardware-backed keys, or Windows signing is prioritized.
