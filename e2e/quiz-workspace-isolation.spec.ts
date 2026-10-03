import { expect, test } from '@playwright/test'

import { loginAs, qaEnvironment } from './qa-helpers'

test.describe('quiz workspace isolation', () => {
  test.beforeEach(() => {
    test.skip(qaEnvironment !== 'mock', 'synthetic browser regression only')
  })

  test('locks same-tick submit and resets result when the quiz route changes', async ({ page }) => {
    await loginAs(page, 'LEARNER')
    await page.goto('/quizzes/50')

    await page.locator('label').filter({ hasText: '개념의 정의를 먼저 확인한다.' }).click()
    await page.getByRole('button', { name: '다음 문항' }).click()
    await page.locator('label').filter({ hasText: '이해가 낮은 페이지를 다시 읽는다.' }).click()

    let releaseSubmission!: () => void
    const submissionGate = new Promise<void>((resolve) => {
      releaseSubmission = resolve
    })
    let submissionCount = 0
    await page.route('**/api/quizzes/50/submit', async (route) => {
      submissionCount += 1
      await submissionGate
      await route.continue()
    })

    await page.locator('form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await expect.poll(() => submissionCount).toBe(1)

    releaseSubmission()
    await expect(page.getByText('점수 48 / 100 · 보완 필요')).toBeVisible()

    await page.evaluate(() => {
      window.history.pushState({}, '', '/quizzes/51')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page).toHaveURL(/\/quizzes\/51$/)
    await expect(page.getByText('현재 설명은 참입니까?')).toBeVisible()
    await expect(page.getByLabel('O')).toBeEnabled()
    await expect(page.getByLabel('O')).not.toBeChecked()
    await expect(page.getByText('점수 48 / 100 · 보완 필요')).toHaveCount(0)
  })
})
