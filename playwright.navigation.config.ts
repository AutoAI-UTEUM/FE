import { defineConfig, devices } from '@playwright/test'

// Synthetic APIs only. Match the physical screen as well as the viewport so
// phone landscape never silently exercises the desktop responsive mode.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'navigation-popup-regressions.spec.ts',
  timeout: 45_000,
  retries: 0,
  workers: 2,
  outputDir: 'qa-artifacts/navigation/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa-artifacts/navigation/results.json' }],
    ['html', { open: 'never', outputFolder: 'qa-artifacts/navigation/html' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4191', locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    ['phone-390', 390, 844, true],
    ['phone-430', 430, 932, true],
    ['phone-landscape', 844, 390, true],
    ['tablet-portrait', 768, 1024, true],
    ['tablet-landscape', 1024, 768, true],
    ['tablet-rail', 820, 600, true],
    ['desktop', 1440, 900, false],
    ['desktop-narrow', 844, 800, false],
  ].map(([name, width, height, hasTouch]) => ({
    name: name as string,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: width as number, height: height as number },
      screen: { width: width as number, height: height as number },
      hasTouch: hasTouch as boolean,
    },
  })),
  webServer: {
    command: process.platform === 'win32'
      ? 'node node_modules/vite/bin/vite.js build --configLoader runner && node node_modules/vite/bin/vite.js preview --configLoader runner --host 127.0.0.1 --port 4191 --strictPort'
      : 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4191 --strictPort',
    url: 'http://127.0.0.1:4191', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_API_BASE_URL: '/api', VITE_API_CAPABILITIES: 'reports,policy-consent', VITE_DEV_PROXY_TARGET: 'mock', QA_ENV: 'mock' },
  },
})
