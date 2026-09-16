import { defineConfig, devices, type Project } from '@playwright/test'

const qaEnvironment = process.env.QA_ENV ?? 'mock'
const fullMatrix = process.env.QA_FULL_MATRIX === '1'
const artifactRoot = `qa-artifacts/${qaEnvironment}`
const baseURL = qaEnvironment === 'prod'
  ? 'https://www.uteum.com'
  : qaEnvironment === 'dev'
    ? 'https://dev.uteum.com'
    : 'http://127.0.0.1:4173'

const desktopProjects: Project[] = [
  project('chromium-1280', 'chromium', 1280, 800),
  project('chromium-1440', 'chromium', 1440, 900),
  project('chromium-1920', 'chromium', 1920, 1080),
]

const touchProjects: Project[] = [
  touchProject('phone-360', 360, 800),
  touchProject('phone-390', 390, 844),
  touchProject('phone-430', 430, 932),
  touchProject('tablet-768-portrait', 768, 1024),
  touchProject('tablet-768-landscape', 1024, 768),
  touchProject('tablet-800-portrait', 800, 1280),
  touchProject('tablet-800-landscape', 1280, 800),
  touchProject('tablet-820-portrait', 820, 1180),
  touchProject('tablet-820-landscape', 1180, 820),
  touchProject('tablet-834-portrait', 834, 1194),
  touchProject('tablet-834-landscape', 1194, 834),
  touchProject('tablet-1024-portrait', 1024, 1366),
  touchProject('tablet-1024-landscape', 1366, 1024),
]

const crossBrowserProjects: Project[] = [
  project('firefox-1440', 'firefox', 1440, 900),
  project('webkit-1440', 'webkit', 1440, 900),
]

export default defineConfig({
  testDir: './e2e',
  outputDir: `${artifactRoot}/test-results`,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  workers: process.env.CI ? 4 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['line'],
    ['json', { outputFile: `${artifactRoot}/results.json` }],
    ['junit', { outputFile: `${artifactRoot}/junit.xml` }],
    ['html', { open: 'never', outputFolder: `${artifactRoot}/html` }],
  ],
  use: {
    baseURL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: qaEnvironment === 'mock'
    ? {
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort',
        env: {
          ...process.env,
          VITE_API_BASE_URL: '/api',
          VITE_API_CAPABILITIES: 'reports,password-reset,oauth,schedule,analytics',
          VITE_DEV_PROXY_TARGET: 'mock',
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: baseURL,
      }
    : undefined,
  projects: fullMatrix
    ? [...desktopProjects, ...touchProjects, ...crossBrowserProjects]
    : [desktopProjects[1], touchProjects[1], touchProjects[6]],
})

function project(name: string, browserName: 'chromium' | 'firefox' | 'webkit', width: number, height: number): Project {
  const device = browserName === 'chromium'
    ? devices['Desktop Chrome']
    : browserName === 'firefox'
      ? devices['Desktop Firefox']
      : devices['Desktop Safari']
  return { name, use: { ...device, viewport: { height, width } } }
}

function touchProject(name: string, width: number, height: number): Project {
  return {
    name,
    use: {
      ...devices['Desktop Chrome'],
      hasTouch: true,
      screen: { height, width },
      viewport: { height, width },
    },
  }
}
