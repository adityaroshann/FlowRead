import { defineConfig } from '@playwright/test';

// Extensions need a persistent context; the fixture in tests/e2e creates it.
// Run `npm run build:e2e` first (npm run test:e2e does both).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
});
