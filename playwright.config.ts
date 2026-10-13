import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['json', { outputFile: 'test-results/playwright.json' }]],
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'node scripts/start.mjs',
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT), HACCP_DATA_DIR: '.e2e-data', HACCP_FRESH: '1', HACCP_TEST_MODE: '1' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
