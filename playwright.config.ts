import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { actionTimeout: 5000, baseURL: 'http://127.0.0.1:4200', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx --tsconfig apps/api/tsconfig.json scripts/test-server.ts',
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      env: { FL_API_TARGET: 'http://127.0.0.1:3101' },
      command: 'npm run dev --workspace @familylink/web',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
