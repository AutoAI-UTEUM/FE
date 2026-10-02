import { expect, test } from '@playwright/test'

import { loginAs } from './qa-helpers'

test('entrance requests support keyboard selection, visible focus, reload, and processing locks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1440', 'Desktop keyboard acceptance is covered in Chromium.')
  await loginAs(page, 'INSTRUCTOR')
  let listCount = 0
  let releaseProcess!: () => void
  const processGate = new Promise<void>((resolve) => { releaseProcess = resolve })
  await page.route('**/api/classrooms**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/api/classrooms') {
      await route.fulfill({
        json: success(paged([{
          classroomId: 11,
          color: 'BLUE',
          endDate: '2026-11-15',
          instructorName: '김강사',
          name: '자료구조',
          startDate: '2026-08-03',
          status: 'ACTIVE',
          weekCount: 15,
        }])),
      })
      return
    }
    if (request.method() === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
      listCount += 1
      await route.fulfill({
        json: success(paged([{
          classroomId: 11,
          learner: { email: 'learner@example.com', name: '김학습', userId: 101 },
          requestedAt: '2026-08-14T09:00:00Z',
          requestId: 201,
          status: 'PENDING',
        }])),
      })
      return
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/approve')) {
      await processGate
      await route.fulfill({ json: success(null) })
      return
    }
    await route.fallback()
  })
  await page.goto('/entrance-requests')
  await expect(page.getByText('김학습')).toBeVisible()

  const tabs = page.getByRole('tab')
  await tabs.nth(2).focus()
  await page.keyboard.press('Tab')
  const selectAll = page.getByRole('checkbox', { name: '전체 요청 선택' })
  await expect(selectAll).toBeFocused()
  await expect(selectAll.locator('+ span')).not.toHaveCSS('box-shadow', 'none')
  await page.keyboard.press('Space')
  await expect(selectAll).toBeChecked()

  await page.getByRole('button', { exact: true, name: '승인' }).click()
  const requestCheckbox = page.getByRole('checkbox', { name: '김학습 요청 선택' })
  await expect(requestCheckbox).toBeDisabled()
  await expect(page.getByRole('button', { name: '선택 승인' })).toBeDisabled()
  releaseProcess()
  await expect(page.getByText('입장 요청을 승인했습니다.')).toBeVisible()

  await tabs.nth(0).click()
  await expect.poll(() => listCount).toBeGreaterThanOrEqual(3)
  await expect(page.getByText('입장 정보를 불러오는 중입니다.')).toBeHidden()
})

function paged<T>(items: T[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: 1 }
}

function success<T>(data: T) {
  return { data, message: '요청을 처리했습니다.', success: true }
}
