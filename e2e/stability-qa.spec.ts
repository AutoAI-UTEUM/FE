import { expect, test } from '@playwright/test'

import { loginAs, monitorPage, qaEnvironment, waitForAppSettled } from './qa-helpers'

test.describe('long-session frontend stability', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(qaEnvironment !== 'mock', 'destructive stability simulations run against mock only')
    test.skip(testInfo.project.name !== 'chromium-1440', 'stability baseline uses desktop Chromium')
  })

  test('[FE] repeated route changes do not leak requests, errors or excessive heap', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const monitor = monitorPage(page)
    await loginAs(page, 'LEARNER')
    const heapSamples: number[] = []
    const routes = ['/classrooms', '/calendar', '/notes', '/review-quizzes', '/exams']

    for (let index = 0; index < 30; index += 1) {
      await page.goto(routes[index % routes.length])
      await waitForAppSettled(page)
      if (index % 5 === 0) {
        heapSamples.push(await page.evaluate(() => {
          const memory = performance as Performance & { memory?: { usedJSHeapSize: number } }
          return memory.memory?.usedJSHeapSize ?? 0
        }))
      }
    }

    const nonZeroSamples = heapSamples.filter(Boolean)
    const growthBytes = nonZeroSamples.length > 1
      ? nonZeroSamples.at(-1)! - nonZeroSamples[0]
      : 0
    await testInfo.attach('heap-samples.json', {
      body: Buffer.from(JSON.stringify({ growthBytes, heapSamples }, null, 2)),
      contentType: 'application/json',
    })
    expect.soft(growthBytes, '30 route changes should not grow the JS heap by more than 50 MiB').toBeLessThanOrEqual(50 * 1024 * 1024)
    monitor.assertClean()
  })

  test('[FE] transient API failure recovers without leaving a blank page', async ({ page }, testInfo) => {
    await loginAs(page, 'LEARNER')
    let failedOnce = false
    await page.route('**/api/classrooms**', async (route) => {
      if (!failedOnce) {
        failedOnce = true
        await route.fulfill({
          body: JSON.stringify({ error: { code: 'TEMPORARY_UNAVAILABLE', message: 'temporary QA failure' }, success: false }),
          contentType: 'application/json',
          status: 503,
        })
        return
      }
      await route.continue()
    })

    await page.goto('/classrooms')
    await expect(page.locator('body')).not.toBeEmpty()
    await expect(page.locator('body')).not.toContainText('Application error')
    const retry = page.getByRole('button', { name: '다시 시도' })
    const classroomHeading = page.getByRole('heading', { name: '내 강의실', exact: true })
    await page.waitForTimeout(500)
    if (await retry.isVisible()) await retry.click()
    await waitForAppSettled(page)
    await expect(classroomHeading).toBeVisible()
    await expect(page.getByRole('heading', { name: '강의실을 불러오지 못했습니다', exact: true })).toBeHidden()
    await testInfo.attach('recovery-result.json', {
      body: Buffer.from(JSON.stringify({ failedOnce, recovered: true }, null, 2)),
      contentType: 'application/json',
    })
  })
})
