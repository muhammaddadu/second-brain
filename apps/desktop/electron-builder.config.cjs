/**
 * Packaging config (ADR 0011), parameterised by build environment. `BUILD_ENV` (development | beta |
 * production; default production) selects the appId / productName / update channel from
 * build/environments.cjs, so each flavour installs side by side and publishes to its own channel.
 * Signing/notarization stay credential-gated — unset credentials → an unsigned but installable build.
 */
const { resolveEnv } = require('./build/environments.cjs');

const env = resolveEnv(process.env.BUILD_ENV);
// macOS signing + notarization — see docs/guides/building-and-releasing.md and ADR 0012.
// The Developer ID Application certificate is provisioned into the build keychain by `fastlane
// match` (locally, or read-only in CI); electron-builder then *auto-discovers* that identity — so
// we do NOT pin a .p12 path here. The presence of an App Store Connect API key (APPLE_API_KEY, a
// path to the .p8) is our signal that a full signed build is intended; a raw CSC_LINK (.p12) is
// still honored as an alternative signing source. With neither, `identity: null` makes
// electron-builder *skip* signing cleanly (unsigned but installable) — anyone can build with no
// Apple credentials.
const macSigning = process.env.APPLE_API_KEY || process.env.CSC_LINK ? {} : { identity: null };
// Notarization — not code signing — is what clears Gatekeeper's "app is damaged" block on
// *downloaded* builds; a signed-but-un-notarized app still fails. `notarize` must be a BOOLEAN in
// electron-builder 26.x (an object fails schema validation); the credentials come from the
// environment (APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER / APPLE_TEAM_ID). Pin it
// explicitly: `notarize: false` guarantees an unsigned build never tries (and fails) to notarize.
const macNotarize =
  process.env.APPLE_API_KEY && process.env.APPLE_TEAM_ID ? { notarize: true } : { notarize: false };

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: env.appId,
  productName: env.productName,
  // Static slug (NOT ${name} — the package is "@brain/desktop", whose slash would break the output
  // path). Carries the env so a beta and a production installer never collide in one dist/ folder.
  artifactName: `second-brain-${env.id}-\${version}-\${arch}.\${ext}`,
  files: [
    'out/**',
    'package.json',
    '!**/*.{map,ts,tsx}',
    '!**/{tsconfig.json,tsconfig.*.json,vite.config.*,electron.vite.config.*}',
  ],
  directories: {
    output: `dist/${env.id}`,
    buildResources: 'build',
  },
  // Native/WASM assets must live outside the asar so Node/Electron can load them at runtime.
  asarUnpack: [
    '**/node_modules/node-sqlite3-wasm/**',
    '**/node_modules/onnxruntime-node/**',
    '**/node_modules/@huggingface/**',
    '**/node_modules/sharp/**',
  ],
  mac: {
    category: 'public.app-category.productivity',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    ...macSigning,
    ...macNotarize,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64', 'arm64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: {
    category: 'Utility',
    maintainer: 'Muhammad Dadu <noreply@github.com>',
    // The package name (@brain/desktop) isn't a valid Linux binary/AppImage name — use a clean one.
    executableName: 'second-brain',
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
    ],
  },
  // Auto-update / release target. Each environment publishes to its own channel on the same repo.
  publish: {
    provider: 'github',
    owner: 'muhammaddadu',
    repo: 'second-brain',
    channel: env.channel,
  },
};
