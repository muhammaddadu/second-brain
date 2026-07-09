import { defineConfig } from 'vitest/config';

// Unit tests for pure, DOM-free renderer modules (e.g. the diagram registry). Component and
// full-app behaviour is covered by the Playwright E2E, not vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
