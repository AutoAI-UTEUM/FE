import { expect, test } from '@playwright/test'

import {
  assertPageHealthy,
  installProductionMutationGuard,
  loginAs,
  monitorPage,
  qaEnvironment,
  waitForAppSettled,
  type QaRole,
} from './qa-helpers'

const roleRoutes: Record<QaRole, string[]> = {
  LEARNER: ['/classrooms', '/calendar', '/notes', '/review-quizzes', '/exams', '/settings', '/updates'],
  INSTRUCTOR: ['/classrooms', '/calendar', '/entrance-requests', '/settings', '/updates'],
  ADMIN: ['/admin', '/admin?tab=classrooms', '/admin?tab=ai-usage', '/admin?tab=infra', '/admin?tab=updates'],
}

test.describe('public and authentication', () => {
  test('[FE] public login and password recovery routes render @visual', async ({ page }, testInfo) => {
    const monitor = monitorPage(page)
    if (qaEnvironment === 'mock') {
      await page.route('**/api/auth/refresh', (route) => route.fulfill({
        body: JSON.stringify({ error: { code: 'TOKEN_INVALID', message: 'mock signed out' }, success: false }),
        contentType: 'application/json',
        status: 401,
      }))
    }
    await page.goto('/login')
    await waitForAppSettled(page)
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()
    await assertPageHealthy(page, testInfo)

    await page.goto('/forgot-password')
    await waitForAppSettled(page)
    await expect(page.getByRole('heading', { name: '비밀번호 찾기' })).toBeVisible()
    await assertPageHealthy(page, testInfo)
    monitor.assertClean()
  })

  test('[FE] invalid login stays on the login page', async ({ page }) => {
    test.skip(qaEnvironment !== 'mock', 'remote environments do not receive intentional invalid-login traffic')
    await page.route('**/api/auth/refresh', (route) => route.fulfill({
      body: JSON.stringify({ error: { code: 'TOKEN_INVALID', message: 'mock signed out' }, success: false }),
      contentType: 'application/json',
      status: 401,
    }))
    await page.goto('/login')
    await page.getByLabel('이메일').fill('locked@example.com')
    await page.locator('#login-password').fill('password123')
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('alert')).toBeVisible()
  })
})

for (const role of ['LEARNER', 'INSTRUCTOR', 'ADMIN'] as const) {
  test.describe(`${role} smoke`, () => {
    test(`[FE] ${role} navigation, layout and accessibility @visual`, async ({ page }, testInfo) => {
      const mutationViolations = await installProductionMutationGuard(page)
      const monitor = monitorPage(page)
      const loggedIn = await loginAs(page, role)
      test.skip(!loggedIn, `${qaEnvironment} ${role} QA credentials are not configured`)

      for (const path of roleRoutes[role]) {
        await test.step(path, async () => {
          await page.goto(path)
          await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
          await assertPageHealthy(page, testInfo, { axe: path === roleRoutes[role][0] })
          if (role === 'ADMIN' && path === '/admin?tab=ai-usage') {
            const pageOverflow = await page.evaluate(() => (
              Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
              - document.documentElement.clientHeight
            ))
            expect.soft(pageOverflow, 'AI usage must not create page-level vertical scrolling').toBeLessThanOrEqual(2)
            await expect(page.getByRole('region', { name: 'AI 사용량 상세' })).toBeVisible()
            const userCallsRegion = page.getByRole('region', { name: '사용자별 호출 목록' })
            if (!await userCallsRegion.isVisible()) {
              await page.getByRole('button', { name: '사용자별 호출' }).click()
            }
            await expect(userCallsRegion).toBeVisible()
          }
          if (role === 'ADMIN' && path === '/admin?tab=updates') {
            const pageOverflow = await page.evaluate(() => (
              Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
              - document.documentElement.clientHeight
            ))
            expect.soft(pageOverflow, 'Admin updates must not create page-level vertical scrolling').toBeLessThanOrEqual(2)
            await expect(page.getByRole('group', { name: '개발 파트' })).toBeVisible()
            await expect(
              page.getByRole('navigation', { name: '관리자 메뉴' })
                .getByRole('button', { name: '업데이트' }),
            ).toHaveAttribute('aria-current', 'page')
          }
        })
      }

      expect(mutationViolations, 'production mutation requests must be blocked').toEqual([])
      monitor.assertClean()
    })
  })
}

test.describe('mock feature workspaces', () => {
  test.beforeEach(() => test.skip(qaEnvironment !== 'mock', 'deterministic deep feature coverage runs against mock only'))

  test('[FE] learner PDF, chat, quiz and diagnosis workspaces render @visual', async ({ page }, testInfo) => {
    const monitor = monitorPage(page)
    await loginAs(page, 'LEARNER')
    for (const path of ['/sessions/100', '/quizzes/50', '/sessions/100/diagnosis/42']) {
      await page.goto(path)
      await expect(page).not.toHaveURL(/\/login/)
      if (path === '/sessions/100') {
        await expect(page.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 15_000 })
        if (testInfo.project.name.startsWith('tablet-')) {
          const pdfBounds = await page.getByRole('region', { name: 'PDF 뷰어' }).boundingBox()
          const aiBounds = await page.getByRole('region', { name: 'AI 학습 패널' }).boundingBox()
          expect(pdfBounds, 'tablet PDF panel must be visible').not.toBeNull()
          expect(aiBounds, 'tablet AI panel must be visible').not.toBeNull()
          expect(
            aiBounds!.x,
            'tablet AI panel must stay to the right of the PDF panel',
          ).toBeGreaterThanOrEqual(pdfBounds!.x + pdfBounds!.width - 1)
          expect(Math.abs(aiBounds!.y - pdfBounds!.y), 'tablet panels must share a top edge').toBeLessThanOrEqual(1)
        }
      }
      await assertPageHealthy(page, testInfo, { axe: false })
    }
    monitor.assertClean()
  })

  test('[FE] instructor classroom, analytics and report surfaces render @visual', async ({ page }, testInfo) => {
    const monitor = monitorPage(page)
    await loginAs(page, 'INSTRUCTOR')
    for (const path of ['/classrooms/12', '/classrooms/12/analytics', '/classrooms/12/reports', '/classrooms/12/report-criteria']) {
      await page.goto(path)
      await expect(page).not.toHaveURL(/\/login/)
      await assertPageHealthy(page, testInfo, { axe: false })
    }
    monitor.assertClean()
  })
})
