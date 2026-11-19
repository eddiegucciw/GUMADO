import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real GUMADO deployment backed by a TEST
 * Supabase project (never production). Required environment:
 *   E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_AGENT_EMAIL, E2E_AGENT_PASSWORD
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
  ],
});
