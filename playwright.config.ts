import { defineConfig, devices } from '@playwright/test';

/**
 * Golden-path e2e config. See docs/08-testing-and-quality.md.
 * Run `pnpm exec playwright install` once to fetch browsers before `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  // Specs share one dev server and mock the API per-page; run serially for
  // deterministic timing (the suite is small and fast).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Local: concise list. CI: also emit the HTML report for the uploaded artifact.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
