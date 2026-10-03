import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'qa-artifacts/calendar/test-results',
  projects: [
    {
      name: 'chromium-1440',
      use: { ...devices['Desktop Chrome'], viewport: { height: 900, width: 1440 } },
    },
    {
      name: 'phone-390',
      use: {
        ...devices['Desktop Chrome'],
        hasTouch: true,
        screen: { height: 844, width: 390 },
        viewport: { height: 844, width: 390 },
      },
    },
  ],
  reporter: [['line']],
  retries: 0,
  testDir: './e2e',
  testMatch: 'instructor-calendar.mock.spec.ts',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:44173',
    locale: 'ko-KR',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 44173 --strictPort',
    env: {
      ...process.env,
      VITE_API_BASE_URL: '/api',
      VITE_API_CAPABILITIES: 'reports,policy-consent',
    },
    reuseExistingServer: false,
    timeout: 300_000,
    url: 'http://127.0.0.1:44173',
  },
  workers: 1,
})
