import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { loginAs, qaEnvironment, waitForAppSettled } from './qa-helpers'

test.describe('administrator infrastructure accessibility', () => {
  test.beforeEach(() => test.skip(qaEnvironment !== 'mock', 'accessibility contract uses mock data'))

  test('keeps the AWS detail drawer free of serious accessibility violations', async ({ page }) => {
    await loginAs(page, 'ADMIN')
    await page.goto('/admin?tab=infra')
    await waitForAppSettled(page)
    await page.getByRole('button', { name: 'AWS 비용 상세 보기' }).click()
    await expect(page.getByRole('dialog', { name: 'AWS 사용량 · 비용' })).toBeVisible()

    const scan = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = scan.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
    expect(serious).toEqual([])
  })
})
