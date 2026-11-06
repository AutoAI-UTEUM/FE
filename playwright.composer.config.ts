import { defineConfig, devices } from '@playwright/test'

// Dedicated synthetic build only; deployment readiness stays absent/OFF.
const readiness = process.env.QA_COMPOSER_READINESS ?? ''
const mode = readiness === 'spring-composer-prediction-sse-v1' ? 'synthetic-ready' : 'default-off'
export default defineConfig({
  testDir: './e2e', testMatch: 'composer-prediction.spec.ts',
  forbidOnly: true, retries: 0, workers: 2, timeout: 30_000,
  outputDir: `qa-artifacts/composer/${mode}/test-results`,
  reporter: [['line'], ['json', { outputFile: `qa-artifacts/composer/${mode}/results.json` }]],
  use: { baseURL: 'http://127.0.0.1:4198', locale: 'ko-KR', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4198 --strictPort',
    url: 'http://127.0.0.1:4198', reuseExistingServer: false, timeout: 120_000,
    env: { VITE_API_BASE_URL: '/api', VITE_API_CAPABILITIES: 'reports,policy-consent', VITE_DEV_PROXY_TARGET: 'mock', VITE_COMPOSER_PREDICTION_READINESS: readiness },
  },
})
