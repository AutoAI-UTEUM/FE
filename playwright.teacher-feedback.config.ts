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
  ],
})
