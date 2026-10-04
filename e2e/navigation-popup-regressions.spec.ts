import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

import { loginAs, waitForAppSettled } from './qa-helpers'

async function withinViewport(page: Page, surface: Locator) {
  const box = await surface.boundingBox()
  const viewport = page.viewportSize()!
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(`${name}.png`, { body: await page.screenshot(), contentType: 'image/png' })
}

async function openNotifications(page: Page, tabletPortrait: boolean) {
  if (tabletPortrait) {
    await page.getByRole('button', { name: '프로필 메뉴', exact: true }).click()
    await page.getByRole('menuitem', { name: /^알림/ }).click()
  } else {
    await page.getByRole('button', { name: /^알림 \d+개$/ }).click()
  }
  await expect(page.getByRole('dialog', { name: '알림', exact: true })).toBeVisible()
}

for (const role of ['LEARNER', 'INSTRUCTOR'] as const) {
  test.describe(`${role} navigation popups`, () => {
    const forbidden = new WeakMap<Page, string[]>()
    test.beforeEach(async ({ page }) => {
      const violations: string[] = []
      forbidden.set(page, violations)
      await page.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.hostname !== '127.0.0.1') {
          violations.push(`external ${url.origin}`)
          await route.abort('blockedbyclient')
          return
        }
        if (url.pathname.startsWith('/api/')
          && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
          && !['/api/auth/login', '/api/auth/refresh'].includes(url.pathname)) {
          violations.push(`${request.method()} ${url.pathname}`)
          await route.abort('blockedbyclient')
          return
        }
        if (url.pathname.endsWith('/stream')) {
          violations.push(`AI stream ${url.pathname}`)
          await route.abort('blockedbyclient')
          return
        }
        await route.continue()
      })
    })
    test.afterEach(({ page }) => {
      expect(forbidden.get(page), 'navigation checks must stay local and read-only').toEqual([])
    })

    test('profile has one entry and one popup; keyboard, outside press, history and scrolling remain operable', async ({ page }, testInfo) => {
      await loginAs(page, role)
      await waitForAppSettled(page)
      await capture(page, testInfo, 'classrooms')
      const tabletLandscape = ['tablet-landscape', 'tablet-rail'].includes(testInfo.project.name)
      const trigger = page.getByRole('button', { name: '프로필 메뉴', exact: true })
      if (tabletLandscape) {
        await expect(page.locator('button[aria-label="프로필 메뉴"]')).toHaveCount(0)
        await page.locator('aside a[title="설정"][href="/settings"]').click()
        await expect(page).toHaveURL(/\/settings$/)
        await page.goBack()
        await expect(page).toHaveURL(/\/classrooms$/)
        return
      }
      await expect(page.locator('button[aria-label="프로필 메뉴"]')).toHaveCount(1)
      const bottom = page.getByRole('navigation', { name: '하단 주요 메뉴' })
      if (/^(phone|tablet-portrait)/.test(testInfo.project.name)) {
        await expect(bottom.getByRole('button', { name: '프로필 메뉴' })).toHaveCount(1)
      }
      await trigger.focus()
      await page.keyboard.press('Enter')
      const menu = page.getByRole('menu')
      await expect(page.locator('[role="menu"]')).toHaveCount(1)
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await withinViewport(page, menu)
      await capture(page, testInfo, 'profile-open')
      const logout = menu.getByRole('menuitem', { name: '로그아웃', exact: true })
      await logout.focus()
      const lastItem = await logout.boundingBox()
      const menuBox = await menu.boundingBox()
      expect(lastItem!.y).toBeGreaterThanOrEqual(menuBox!.y)
      expect(lastItem!.y + lastItem!.height).toBeLessThanOrEqual(menuBox!.y + menuBox!.height)
      if (testInfo.project.name === 'phone-landscape' && role === 'LEARNER') {
        expect(await menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      }
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await trigger.click()
      await page.mouse.click(2, page.viewportSize()!.height / 2)
      await expect(menu).toHaveCount(0)
      await trigger.click()
      await menu.getByRole('menuitem', { name: '설정', exact: true }).click()
      await expect(page).toHaveURL(/\/settings$/)
      await trigger.click()
      await page.goBack()
      await expect(page).toHaveURL(/\/classrooms$/)
      await expect(page.locator('[role="menu"]')).toHaveCount(0)
    })

    test('notifications stay inside the viewport and expose the last row without writes', async ({ page }, testInfo) => {
      await page.route('**/api/users/me/notifications?*', (route) => route.fulfill({
        json: {
          success: true, message: 'Synthetic navigation fixture',
          data: { page: 0, size: 20, totalElements: 20, totalPages: 1,
            items: Array.from({ length: 20 }, (_, index) => ({
              notificationId: index + 1, title: `합성 알림 ${index + 1}`,
              body: '경계와 스크롤만 검증하는 로컬 알림입니다.',
              type: role === 'INSTRUCTOR' ? 'JOIN_REQUEST_RECEIVED' : 'NOTICE_PUBLISHED',
              readAt: null, createdAt: '2026-10-04T00:00:00Z', link: { classroomId: 12 },
            })),
          },
        },
      }))
      await loginAs(page, role)
      await waitForAppSettled(page)
      const portrait = testInfo.project.name === 'tablet-portrait'
      const rail = testInfo.project.name === 'tablet-rail'
      if (rail) await page.getByRole('button', { name: '메뉴 펼치기', exact: true }).click()
      await openNotifications(page, portrait)
      const panel = page.getByRole('dialog', { name: '알림', exact: true })
      await expect(page.locator('[role="dialog"][aria-label="알림"]')).toHaveCount(1)
      await withinViewport(page, panel)
      await expect(panel.getByRole('button', { name: '모두 읽음', exact: true })).toBeEnabled()
      await expect.poll(() => panel.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      await capture(page, testInfo, 'notifications-open')
      const last = panel.getByRole('button', { name: '합성 알림 20 알림 삭제', exact: true })
      await last.focus()
      const box = await last.boundingBox()
      const panelBox = await panel.boundingBox()
      expect(box!.y).toBeGreaterThanOrEqual(panelBox!.y)
      expect(box!.y + box!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height)
      expect(await last.evaluate((element) => {
        const r = element.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit === element || (hit !== null && element.contains(hit))
      })).toBe(true)
      await capture(page, testInfo, 'notifications-scrolled')
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(portrait
        ? page.getByRole('button', { name: '프로필 메뉴', exact: true })
        : page.getByRole('button', { name: /^알림 \d+개$/ })).toBeFocused()
      if (rail) {
        await expect(page.getByRole('button', { name: '메뉴 접기', exact: true })).toHaveAttribute('aria-expanded', 'true')
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: '메뉴 펼치기', exact: true })).toBeFocused()
      }
      if (!portrait && !['tablet-landscape', 'tablet-rail'].includes(testInfo.project.name)) {
        await openNotifications(page, false)
        const profile = page.getByRole('button', { name: '프로필 메뉴', exact: true })
        await profile.focus()
        await page.keyboard.press('Enter')
        await expect(panel).toHaveCount(0)
        await expect(page.getByRole('menu')).toHaveCount(1)
        await page.keyboard.press('Escape')
      }
      await openNotifications(page, portrait)
      await page.mouse.click(2, page.viewportSize()!.height / 2)
      await expect(panel).toHaveCount(0)
      if (['tablet-landscape', 'tablet-rail'].includes(testInfo.project.name)) {
        await page.locator('aside a[title="설정"][href="/settings"]').click()
      } else {
        await page.getByRole('button', { name: '프로필 메뉴', exact: true }).click()
        await page.getByRole('menuitem', { name: '설정', exact: true }).click()
      }
      await expect(page).toHaveURL(/\/settings$/)
      await openNotifications(page, portrait)
      await page.goBack()
      await expect(page).toHaveURL(/\/classrooms$/)
      await expect(page.locator('[role="dialog"][aria-label="알림"]')).toHaveCount(0)
    })

    test('classroom and learning navigation preserve desktop profile and progress without bottom-bar overlap', async ({ page }, testInfo) => {
      await loginAs(page, role)
      await page.goto('/classrooms/12')
      await waitForAppSettled(page)
      await expect(page.getByRole('heading', { name: '자료구조', exact: true })).toBeVisible()
      await capture(page, testInfo, 'classroom-detail')
      await page.goto('/sessions/100')
      await waitForAppSettled(page)
      await expect(page.locator('.react-pdf__Page__canvas')).toBeVisible()
      await expect(page.getByRole('navigation', { name: '하단 주요 메뉴' })).toHaveCount(0)
      if (testInfo.project.name.startsWith('phone-')) {
        await page.getByRole('tablist', { name: '작업 화면' }).getByRole('tab', { name: '학습', exact: true }).click()
      }
      if (testInfo.project.name === 'desktop') {
        await expect(page.getByRole('button', { name: '프로필 메뉴', exact: true })).toBeVisible()
        await expect(page.getByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })).toBeVisible()
      }
      const studyProfile = page.getByRole('button', { name: '프로필 메뉴', exact: true })
      if (await studyProfile.isVisible()) {
        await studyProfile.focus()
        await page.keyboard.press('Enter')
        await expect(page.locator('[role="menu"]')).toHaveCount(1)
        await withinViewport(page, page.getByRole('menu'))
        await capture(page, testInfo, 'study-profile')
        await page.keyboard.press('Escape')
        await expect(studyProfile).toBeFocused()
      }
      const studyBell = page.getByRole('button', { name: /^알림 \d+개$/ })
      if (await studyBell.isVisible()) {
        await studyBell.focus()
        await page.keyboard.press('Enter')
        const panel = page.getByRole('dialog', { name: '알림', exact: true })
        await withinViewport(page, panel)
        await capture(page, testInfo, 'study-notifications')
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
        await expect(studyBell).toBeFocused()
      }
      const input = page.locator('#chat-question')
      await input.focus()
      await expect(input).toBeFocused()
      await withinViewport(page, input)
      await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await capture(page, testInfo, 'study-learning')
      if (testInfo.project.name.startsWith('phone-')) {
        await page.getByRole('tablist', { name: '작업 화면' }).getByRole('tab', { name: '자료', exact: true }).click()
      }
      await page.getByRole('link', { name: '주차 페이지로', exact: true }).click()
      await expect(page).toHaveURL(/\/classrooms\/12$/)
    })
  })
}
