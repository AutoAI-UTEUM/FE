import { expect, test } from '@playwright/test'
import { loginAs, qaEnvironment } from './qa-helpers'

test('explicit PDF page input keeps bounds and uses existing page navigation', async ({ page }) => {
  test.skip(qaEnvironment !== 'mock', 'synthetic data only')
  const moves: number[] = []
  await page.route('**/api/sessions/100/page', async (route) => {
    const body = route.request().postDataJSON() as { pageNumber: number }
    moves.push(body.pageNumber)
    await route.continue()
  })
  await loginAs(page, 'LEARNER')
  await page.goto('/sessions/100')
  const input = page.getByRole('textbox', { name: /이동할 페이지 번호/ })
  const move = page.getByRole('button', { name: '이동', exact: true })
  await expect(input).toBeVisible()
  await input.fill('0')
  await expect(move).toBeDisabled()
  await input.fill('2')
  expect(moves).toHaveLength(0)
  await input.press('Enter')
  await expect.poll(() => moves).toEqual([2])
  await expect(input).toHaveValue('2')
  await expect(move).toBeDisabled()
  await input.fill('1')
  await move.click()
  await expect.poll(() => moves).toEqual([2, 1])
  await expect(input).toHaveValue('1')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth))
  await page.screenshot({ path: test.info().outputPath('page-jump.png') })
})
