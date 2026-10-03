import { defineConfig, devices } from '@playwright/test'

const port = 42121
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  outputDir: 'qa-artifacts/quiz-isolation/test-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'qa-artifacts/quiz-isolation/html' }],
  ],
  use: {
    baseURL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
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
  projects: [{
    name: 'chromium-quiz',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { height: 900, width: 1440 },
    },
  }],
})
