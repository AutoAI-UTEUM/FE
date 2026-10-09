import { defineConfig, devices } from '@playwright/test'
const ready = process.env.QA_GUARDIAN_WORKFLOW_READY === 'synthetic-ready'
export default defineConfig({
  testDir: './e2e', testMatch: 'guardian-workflows.spec.ts', workers: 1, retries: 0, timeout: 30_000,
  outputDir: `qa-artifacts/guardian-workflows/${ready ? 'ready' : 'off'}/test-results`,
  reporter: [['list'], ['json', { outputFile: `qa-artifacts/guardian-workflows/${ready ? 'ready' : 'off'}/browser.json` }]],
  use: { baseURL: 'http://127.0.0.1:4193', trace: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } }],
  webServer: {
    command: 'npm run build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4193 --strictPort', url: 'http://127.0.0.1:4193', reuseExistingServer: false, timeout: 180_000,
    env: { VITE_API_BASE_URL: '/api', VITE_DEV_PROXY_TARGET: 'mock', VITE_GOOGLE_CLIENT_ID: '', VITE_API_CAPABILITIES: 'reports,policy-consent',
      VITE_AUTH_CONTRACT_READINESS: '', VITE_GUARDIAN_TEAM_READINESS: ready ? 'be-guardian-461b8533-v1' : '',
      VITE_GUARDIAN_WORKFLOW_READINESS: ready ? 'be-guardian-workflows-29259371-v1' : '',
      VITE_GUARDIAN_POLICY_REVIEW_READINESS: ready ? 'guardian-policy-review-attested-v1' : '' },
  },
})
