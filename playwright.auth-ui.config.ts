import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'auth-ui-feedback.spec.ts', workers: 1, retries: 0, timeout: 30_000,
  outputDir: 'qa-artifacts/auth-ui/test-results',
  reporter: [['list'], ['json', { outputFile: 'qa-artifacts/auth-ui/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4199', locale: 'ko-KR', trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 740 }, screen: { width: 320, height: 740 }, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4199 --strictPort',
    url: 'http://127.0.0.1:4199', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_API_BASE_URL: '/api', VITE_DEV_PROXY_TARGET: 'mock', VITE_API_CAPABILITIES: 'reports,policy-consent',
      VITE_AUTH_CONTRACT_READINESS: 'be-auth-ee69e425-v1' },
  },
})
