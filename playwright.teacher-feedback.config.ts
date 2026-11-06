import { defineConfig, devices } from '@playwright/test'
import quizConfig from './playwright.quiz.config'

export default defineConfig({
  ...quizConfig,
  testMatch: 'teacher-feedback.spec.ts',
  outputDir: 'qa-artifacts/teacher-feedback/test-results',
  reporter: [['line'], ['json', { outputFile: 'qa-artifacts/teacher-feedback/results.json' }]],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    // Firefox has no touch emulation: narrow viewports remain mouse-driven.
    ...(['firefox', 'webkit'] as const).flatMap((browserName) =>
      ([['desktop', 1440, 900], ['phone', 390, 844], ['tablet', 820, 1180]] as const).map(([size, width, height]) => ({
        name: `${browserName}-${size}`,
        use: {
          ...devices[browserName === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'],
          viewport: { width, height }, screen: { width, height },
          hasTouch: browserName === 'webkit' && size !== 'desktop',
        },
      }))),
  ],
})
