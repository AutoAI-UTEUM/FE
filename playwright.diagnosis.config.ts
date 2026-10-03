import { defineConfig, devices } from '@playwright/test'

const port = process.env.DIAGNOSIS_QA_PORT ?? '44186'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'diagnosis-retest-acceptance.spec.ts',
  outputDir: 'qa-artifacts/diagnosis-retest/test-results',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'qa-artifacts/diagnosis-retest/html' }],
  ],
  projects: [
    {
      name: 'phone-390',
      use: {
        ...devices['Desktop Chrome'],
        hasTouch: true,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'chromium-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  use: {
    baseURL,
    locale: 'ko-KR',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    env: {
      ...process.env,
      VITE_API_BASE_URL: '/api',
      VITE_API_CAPABILITIES: 'reports,policy-consent',
      VITE_DEV_PROXY_TARGET: 'mock',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
})
