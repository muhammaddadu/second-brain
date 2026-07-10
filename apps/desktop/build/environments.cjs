/**
 * Build environments — the single source of truth for how each flavour of the app is packaged and
 * identified (packaging config reads this; the app has its name baked in at build). Non-production
 * builds use a distinct `appId` and `productName` so they install **side by side** with production
 * and get their own userData (config, recent vaults) — you can run Dev/Beta next to your real app.
 *
 * CommonJS on purpose: it's `require`d by electron-builder's config (a .cjs) and by the build script.
 * Add an environment = add one entry here; nothing else needs to change.
 */
const BASE_APP_ID = 'com.secondbrain.app';

/** @typedef {{ id: string, appId: string, productName: string, channel: string }} BuildEnv */

/** @type {Record<string, BuildEnv>} */
const environments = {
  production: {
    id: 'production',
    appId: BASE_APP_ID,
    productName: 'Second Brain',
    channel: 'latest',
  },
  beta: {
    id: 'beta',
    appId: `${BASE_APP_ID}.beta`,
    productName: 'Second Brain Beta',
    channel: 'beta',
  },
  development: {
    id: 'development',
    appId: `${BASE_APP_ID}.dev`,
    productName: 'Second Brain Dev',
    channel: 'dev',
  },
};

/** Resolve an environment by name (from BUILD_ENV), falling back to production. */
function resolveEnv(name) {
  return environments[name] || environments.production;
}

module.exports = { environments, resolveEnv, BASE_APP_ID };
