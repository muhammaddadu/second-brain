/**
 * Packaging config (ADR 0011), parameterised by build environment. `BUILD_ENV` (development | beta |
 * production; default production) selects the appId / productName / update channel from
 * build/environments.cjs, so each flavour installs side by side and publishes to its own channel.
 * Signing/notarization stay credential-gated — unset credentials → an unsigned but installable build.
 */
const { resolveEnv } = require('./build/environments.cjs');

const env = resolveEnv(process.env.BUILD_ENV);
// Sign only when a real cert is provided. `identity: null` makes electron-builder *skip* macOS
// signing cleanly — without it, CI (which sets CSC_LINK to an empty string) tries to sign with an
// empty password and dies with "… not a file". A present CSC_LINK → normal signing.
const macSigning = process.env.CSC_LINK ? {} : { identity: null };

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
