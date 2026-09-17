import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3107',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev -- --port 3107',
    url: 'http://localhost:3107',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_REELAI_CONTENT_BACKEND: process.env.NEXT_PUBLIC_REELAI_CONTENT_BACKEND || 'mock',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
      SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      REELAI_EXTERNAL_PROVIDERS: process.env.REELAI_EXTERNAL_PROVIDERS || '',
      REELAI_DEMO_IMPORTED: process.env.REELAI_DEMO_IMPORTED || '',
    },
  },
});
