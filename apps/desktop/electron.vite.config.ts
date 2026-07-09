import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Uses electron-vite's conventional layout: main → src/main/index.ts,
// preload → src/preload/index.ts, renderer → src/renderer/index.html.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // The derived index (E4) loads WASM SQLite via a runtime require; keep it external so its
        // .wasm ships in node_modules and loads at runtime rather than being bundled into main
        // (ADR 0006). It is a direct desktop dep so it resolves from the built main's location.
        external: ['node-sqlite3-wasm'],
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
