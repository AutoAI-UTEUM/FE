import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'protected-file-cache.spec.ts',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  outputDir: 'qa-artifacts/file-cache/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa-artifacts/file-cache/results.json' }],
    ['html', { open: 'never', outputFolder: 'qa-artifacts/file-cache/html' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    // Tracing, request interception and routing can disable/alter Chromium's HTTP cache.
    trace: 'off',
  },
  projects: [{ name: 'chromium-http-cache' }],
})
