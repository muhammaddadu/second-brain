import { defineConfig } from '@playwright/test';

// E2E drives the built Electron app directly (see e2e/app.spec.ts) — no dev server, so no
// webServer here. `pnpm test:e2e` runs `electron-vite build` first to produce out/.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
