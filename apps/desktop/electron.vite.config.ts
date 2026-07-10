import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// The build environment (development | beta | production), baked into every process so the app
// knows its own flavour — e.g. the renderer shows an env badge for non-production builds. Matches
// the packaging env in build/environments.cjs; defaults to development for `pnpm dev`.
const APP_ENV = JSON.stringify(process.env.BUILD_ENV || 'development');
const define = { __APP_ENV__: APP_ENV };

// Uses electron-vite's conventional layout: main → src/main/index.ts,
// preload → src/preload/index.ts, renderer → src/renderer/index.html.
export default defineConfig({
  main: {
    define,
    build: {
      rollupOptions: {
        // Native/heavy runtime deps loaded on demand: WASM SQLite (ADR 0006) and the lazily-loaded
        // embedding backends (AWS SDK, Transformers.js + onnxruntime — ADR 0008). Keep them external
        // so their binaries/.wasm ship in node_modules and load at runtime instead of being bundled
        // into main. They are direct desktop deps, so they resolve from the built main's location.
        external: [
          'node-sqlite3-wasm',
          '@aws-sdk/client-bedrock-runtime',
          '@huggingface/transformers',
          'mammoth',
          'pdf-parse',
          'xlsx',
          // Markdown conversion (file import) — server-util drags in jsdom, whose relative
          // requires break when bundled (see LEARNINGS: jsdom xhr-sync-worker).
          '@blocknote/server-util',
          // Reads app-update.yml from resources at runtime and pulls in optional transitive deps.
          'electron-updater',
        ],
      },
    },
  },
  preload: { define },
  renderer: {
    define,
    plugins: [react(), tailwindcss()],
  },
});
