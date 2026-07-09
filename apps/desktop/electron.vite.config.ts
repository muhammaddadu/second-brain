import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Uses electron-vite's conventional layout: main → src/main/index.ts,
// preload → src/preload/index.ts, renderer → src/renderer/index.html.
export default defineConfig({
  main: {
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
        ],
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
