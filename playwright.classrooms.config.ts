import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4186'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'classrooms-modal-gate.spec.ts',
  outputDir: 'qa-artifacts/classrooms-modal/test-results',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'qa-artifacts/classrooms-modal/html' }],
  ],
  projects: [
    {
      name: 'phone-320',
      use: { ...devices['Desktop Chrome'], hasTouch: true, viewport: { width: 320, height: 720 } },
    },
    {
      name: 'phone-360',
      use: { ...devices['Desktop Chrome'], hasTouch: true, viewport: { width: 360, height: 800 } },
    },
    {
      name: 'phone-390',
      use: { ...devices['Desktop Chrome'], hasTouch: true, viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop-1440-zoom-200',
      use: { ...devices['Desktop Chrome'], viewport: { width: 720, height: 450 } },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], hasTouch: true, viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'tablet-1024',
      use: { ...devices['Desktop Chrome'], hasTouch: true, viewport: { width: 1024, height: 768 } },
    },
  ],
  use: {
    baseURL,
    locale: 'ko-KR',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'on',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:qa && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4186 --strictPort',
    env: {
      ...process.env,
      VITE_API_BASE_URL: '/api',
      VITE_API_CAPABILITIES: 'reports,password-reset,oauth,schedule,analytics',
      VITE_DEV_PROXY_TARGET: 'mock',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
})
