import { defineConfig, devices } from '@playwright/test'

// Local synthetic-only acceptance; no dev/prod credentials or remote API.
export default defineConfig({
  testDir: './e2e', testMatch: 'launch-auth-contract.spec.ts', workers: 1,
  timeout: 30_000, retries: 0,
  outputDir: 'qa-artifacts/launch-auth/test-results',
  reporter: [['list'], ['json', { outputFile: 'qa-artifacts/launch-auth/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4189', trace: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4189 --strictPort',
    url: 'http://127.0.0.1:4189', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_API_BASE_URL: '/api', VITE_DEV_PROXY_TARGET: 'mock',
      VITE_AUTH_CONTRACT_READINESS: process.env.QA_AUTH_CONTRACT_READINESS ?? '' },
  },
})
