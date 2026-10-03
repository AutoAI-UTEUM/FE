import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAs, qaEnvironment } from './qa-helpers'

test.describe('instructor classroom edit recovery', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => test.skip(qaEnvironment !== 'mock', 'synthetic mutation regression only'))

  for (const width of [390, 1440]) {
    test(`${width}px keyboard recovery and partial retry`, async ({ page }) => {
      await page.setViewportSize({ height: width === 390 ? 844 : 900, width })
      await loginAs(page, 'INSTRUCTOR')

      const classroomPatches: unknown[] = []
      const weekPatchNumbers: number[] = []
      let secondWeekAttempt = 0
      await installClassroomRoutes(page, {
        onClassroomPatch: (body) => classroomPatches.push(body),
        onWeekPatch: (weekNumber) => {
          weekPatchNumbers.push(weekNumber)
          if (weekNumber === 2) secondWeekAttempt += 1
          return weekNumber !== 2 || secondWeekAttempt > 1
        },
      })

      await page.goto('/classrooms/12/edit')
      const startDate = page.getByLabel('수업 시작일')
      await expect(startDate).toHaveValue('2026-08-03')
      await startDate.focus()
      await startDate.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
      await startDate.press('Backspace')
      await expect(startDate).toHaveValue('')
      await expect(page.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()

      await startDate.fill('2026-12-29')
      await startDate.press('Tab')
      await expect(page.locator('output')).toHaveText('2027-01-11')
      await page.getByRole('textbox', { name: '1주차 이름' }).fill('새 1주차')
      await page.getByRole('textbox', { name: '2주차 이름' }).fill('새 2주차')
      await page.getByRole('button', { name: '변경사항 저장' }).click()

      await expect(page.getByText('2주차 저장 실패')).toBeVisible()
      expect(classroomPatches).toHaveLength(1)
      expect(weekPatchNumbers).toEqual([1, 2])
      await expect(page.getByRole('textbox', { name: '1주차 이름' })).toHaveValue('새 1주차')
      await expect(page.getByRole('textbox', { name: '2주차 이름' })).toHaveValue('새 2주차')

      await page.getByRole('button', { name: '변경사항 저장' }).click()
      await expect(page).toHaveURL(/\/classrooms\/12$/)
      expect(classroomPatches).toHaveLength(1)
      expect(weekPatchNumbers).toEqual([1, 2, 2])
    })
  }
})

async function installClassroomRoutes(
  page: Page,
  callbacks: {
    onClassroomPatch: (body: unknown) => void
    onWeekPatch: (weekNumber: number) => boolean
  },
) {
  await page.route('**/api/classrooms/12', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await fulfill(route, classroomFixture)
      return
    }
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON()
      callbacks.onClassroomPatch(body)
      await fulfill(route, { ...classroomFixture, ...body })
      return
    }
    await route.abort('blockedbyclient')
  })
  await page.route('**/api/classrooms/12/weeks', (route) => fulfill(route, { items: weeks }))
  await page.route('**/api/classrooms/12/invite-code', (route) => fulfill(route, { inviteCode: 'SYNTHETIC-CODE' }))
  await page.route('**/api/classrooms/12/weeks/*', async (route) => {
    const weekNumber = Number(new URL(route.request().url()).pathname.split('/').at(-1))
    const body = route.request().postDataJSON() as { title: string }
    if (!callbacks.onWeekPatch(weekNumber)) {
      await route.fulfill({
        contentType: 'application/json',
        json: { error: { code: 'SYNTHETIC_WEEK_FAILURE', details: [], message: '2주차 저장 실패' }, success: false },
        status: 500,
      })
      return
    }
    await fulfill(route, { ...weeks[weekNumber - 1], title: body.title })
  })
}

function fulfill(route: Route, data: unknown) {
  return route.fulfill({
    contentType: 'application/json',
    json: { data, message: '요청이 성공했습니다.', success: true },
    status: 200,
  })
}

const classroomFixture = {
  classroomId: 12,
  color: 'BLUE',
  description: '합성 브라우저 테스트',
  endDate: '2026-08-16',
  instructorName: '강의자',
  learnerCount: 0,
  name: '자료구조',
  pendingRequestCount: 0,
  progressRate: 0,
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 2,
}

const weeks = [1, 2].map((weekNumber) => ({
  displayOrder: weekNumber,
  materials: [],
  status: 'PUBLISHED',
  title: `${weekNumber}주차`,
  weekId: 100 + weekNumber,
  weekNumber,
}))
