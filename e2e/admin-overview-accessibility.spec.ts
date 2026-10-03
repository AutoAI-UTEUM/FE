import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { loginAs, qaEnvironment, waitForAppSettled } from './qa-helpers'

test.describe('administrator overview accessibility', () => {
  test.beforeEach(() => test.skip(qaEnvironment !== 'mock', 'accessibility contract uses mock data'))

  test('has no serious accessibility violations', async ({ page }) => {
    await loginAs(page, 'ADMIN')
    await page.goto('/admin')
    await waitForAppSettled(page)

    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = scan.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
    expect(serious).toEqual([])
  })
})
