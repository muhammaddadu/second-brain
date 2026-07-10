/**
 * Build environment, replaced at build time by electron-vite's `define` (see electron.vite.config.ts)
 * with the literal from BUILD_ENV. Visible to main, preload, and renderer.
 */
declare const __APP_ENV__: 'development' | 'beta' | 'production';
