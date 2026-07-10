/**
 * Packaging config (ADR 0011), parameterised by build environment. `BUILD_ENV` (development | beta |
 * production; default production) selects the appId / productName / update channel from
 * build/environments.cjs, so each flavour installs side by side and publishes to its own channel.
 * Signing/notarization stay credential-gated — unset credentials → an unsigned but installable build.
 */
const { resolveEnv } = require('./build/environments.cjs');

const env = resolveEnv(process.env.BUILD_ENV);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: env.appId,
  productName: env.productName,
  // Artifact names carry the env so a beta and a production dmg never collide in one dist/ folder.
  artifactName: `\${name}-\${version}-${env.id}-\${arch}.\${ext}`,
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
    owner: 'REPLACE_ME',
    repo: 'note-agent-second-brain',
    channel: env.channel,
  },
};
