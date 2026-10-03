import { expect, test, type BrowserContext, type Route } from '@playwright/test'

test.describe('learner classroom modal release gate', () => {
  test('search traps keyboard focus, closes with Escape, and restores its opener', async ({ baseURL, context, page }) => {
    const fixture = await installClassroomFixtures(context, new URL(baseURL!).origin)

    await page.goto('/classrooms')
    const opener = page.getByRole('button', { name: '강의실 검색', exact: true })
    await opener.click()

    const dialog = page.getByRole('dialog', { name: '강의실 검색' })
    const input = dialog.getByRole('textbox', { name: '검색어' })
    const close = dialog.getByRole('button', { name: '검색 닫기' })
    await expect(input).toBeFocused()
    await input.fill('일치하지 않는 검색어')
    await expect(dialog.locator(':is(button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"])')).toHaveCount(2)

    await close.focus()
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await expectNoHorizontalOverflow(page)
    await expectInViewport(close)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    await expectNoHorizontalOverflow(page)
    fixture.assertIsolated()
  })

  test('join stays modal while pending and suppresses repeated submissions', async ({ baseURL, context, page }) => {
    let releaseJoin!: () => void
    const joinGate = new Promise<void>((resolve) => { releaseJoin = resolve })
    let joinRequests = 0
    const fixture = await installClassroomFixtures(context, new URL(baseURL!).origin, async (route, url) => {
      if (url.pathname === '/api/classroom-join-requests' && route.request().method() === 'POST') {
        joinRequests += 1
        await joinGate
        await ok(route, { requestId: 91, requestedAt: '2026-10-02T00:00:00Z', status: 'PENDING' })
        return true
      }
      return false
    })

    await page.goto('/classrooms')
    const opener = page.getByRole('button', { name: '강의실 참여', exact: true })
    await opener.click()

    const dialog = page.getByRole('dialog', { name: '강의실 참여' })
    const input = dialog.getByRole('textbox', { name: '초대 코드' })
    await expect(input).toBeFocused()
    await input.fill('EDU-2026')
    const submit = dialog.getByRole('button', { name: '참여 요청' })

    await submit.focus()
    await submit.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
    await expect.poll(() => joinRequests).toBe(1)
    await expect(dialog.locator('button[type="submit"]')).toBeDisabled()
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(input).toBeFocused()
    await expect(dialog.getByRole('button', { name: '요청 중' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: '참여 창 닫기' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: '취소' })).toBeDisabled()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectInViewport(dialog.getByRole('button', { name: '참여 창 닫기' }))
    await expectInViewport(dialog.getByRole('button', { name: '취소' }))
    await expectInViewport(dialog.getByRole('button', { name: '요청 중' }))

    releaseJoin()
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(joinRequests).toBe(1)
    fixture.assertIsolated()
  })

  test('instructor upload dialogs trap focus and keep a pending mock link registration modal', async ({ baseURL, context, page }) => {
    let releaseUpload!: () => void
    const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve })
    let uploadRequests = 0
    const fixture = await installClassroomFixtures(context, new URL(baseURL!).origin, async (route, url) => {
      if (url.pathname === '/api/classrooms/12/resources' && route.request().method() === 'POST') {
        uploadRequests += 1
        await uploadGate
        await ok(route, {
          createdAt: '2026-10-02T00:00:00Z',
          resourceId: 31,
          title: 'Synthetic link',
          type: 'LINK',
          url: 'https://example.invalid/resource',
          weekNumber: 1,
        })
        return true
      }
      return false
    }, 'INSTRUCTOR')

    await page.goto('/classrooms/12')
    await expect(page.getByRole('heading', { level: 1, name: 'Synthetic classroom' })).toBeVisible()

    const lessonTrigger = page.getByRole('button', { name: '수업 생성', exact: true })
    await lessonTrigger.click()
    const lessonDialog = page.getByRole('dialog', { name: '수업 생성' })
    const weekSelect = lessonDialog.getByRole('combobox', { name: '주차 선택' })
    const lessonClose = lessonDialog.getByRole('button', { name: '수업 생성 닫기' })
    const lessonCancel = lessonDialog.getByRole('button', { name: '취소' })
    await expect(weekSelect).toBeFocused()
    await lessonClose.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(lessonCancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(lessonClose).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(lessonDialog).toHaveCount(0)
    await expect(lessonTrigger).toBeFocused()

    const resourceTrigger = page.getByRole('button', { name: '자료 업로드', exact: true })
    await resourceTrigger.focus()
    await resourceTrigger.click()
    const resourceDialog = page.getByRole('dialog', { name: '자료 업로드' })
    await expect(resourceDialog.getByRole('button', { name: '파일', exact: true })).toBeFocused()
    await resourceDialog.getByRole('button', { name: '웹 링크' }).click()
    await resourceDialog.getByRole('textbox', { name: '웹 주소' }).fill('https://example.invalid/resource')
    await resourceDialog.getByRole('textbox', { name: '자료 제목' }).fill('Synthetic link')
    const upload = resourceDialog.getByRole('button', { name: '업로드', exact: true })
    await upload.focus()
    await upload.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })

    await expect.poll(() => uploadRequests).toBe(1)
    await expect(resourceDialog.locator('button[type="submit"]')).toBeDisabled()
    await page.keyboard.press('Tab')
    await expect(resourceDialog.getByRole('button', { name: '파일', exact: true })).toBeFocused()
    await expect(resourceDialog.getByRole('button', { name: '업로드 중' })).toBeDisabled()
    await expect(resourceDialog.getByRole('button', { name: '자료 업로드 닫기' })).toBeDisabled()
    await expect(resourceDialog.getByRole('button', { name: '취소' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(resourceDialog).toBeVisible()
    await expectNoHorizontalOverflow(page)

    releaseUpload()
    await expect(resourceDialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Synthetic link' })).toBeVisible()
    expect(uploadRequests).toBe(1)
    fixture.assertIsolated()
  })
})

type ApiHandler = (route: Route, url: URL) => boolean | Promise<boolean>
type QaRole = 'INSTRUCTOR' | 'LEARNER'

async function installClassroomFixtures(context: BrowserContext, origin: string, handler?: ApiHandler, role: QaRole = 'LEARNER') {
  const unexpectedApi: string[] = []
  const externalRequests: string[] = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) {
      externalRequests.push(`${request.method()} ${url.origin}${url.pathname}`)
      await route.abort('blockedbyclient')
      return
    }
    if (!url.pathname.startsWith('/api/')) {
      await route.continue()
      return
    }
    if (url.pathname === '/api/auth/refresh') {
      await ok(route, accessGrant())
      return
    }
    if (url.pathname === '/api/users/me') {
      await ok(route, user(role))
      return
    }
    if (url.pathname === '/api/users/me/notifications') {
      await ok(route, pageOf([]))
      return
    }
    if (await handler?.(route, url)) return
    if (url.pathname === '/api/classrooms' && request.method() === 'GET') {
      await ok(route, pageOf([classroom()]))
      return
    }
    if (url.pathname === '/api/classrooms/12' && request.method() === 'GET') {
      await ok(route, classroom())
      return
    }
    if (url.pathname === '/api/classrooms/12/weeks' && request.method() === 'GET') {
      await ok(route, { items: [{ materials: [], status: 'OPEN', title: 'Synthetic week', weekId: 1, weekNumber: 1 }] })
      return
    }
    if (/^\/api\/classrooms\/12\/(exams|notices|resources)$/.test(url.pathname) && request.method() === 'GET') {
      await ok(route, pageOf([]))
      return
    }
    unexpectedApi.push(`${request.method()} ${url.pathname}${url.search}`)
    await fail(route, 501, 'UNEXPECTED_FIXTURE_REQUEST', 'Unexpected synthetic fixture request')
  })

  return {
    assertIsolated() {
      expect(unexpectedApi, 'every API request must have an explicit synthetic fixture').toEqual([])
      expect(externalRequests, 'all external requests must be blocked and absent').toEqual([])
    },
  }
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(Math.max(widths.body, widths.document) - widths.viewport).toBeLessThanOrEqual(2)
}

async function expectInViewport(locator: import('@playwright/test').Locator) {
  const bounds = await locator.boundingBox()
  expect(bounds).not.toBeNull()
  const viewport = locator.page().viewportSize()
  expect(viewport).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height)
}

async function ok(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Synthetic fixture', data }),
  })
}

async function fail(route: Route, status: number, code: string, message: string) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { code, message, details: [] } }),
  })
}

function pageOf(items: unknown[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: items.length ? 1 : 0 }
}

function user(role: QaRole) {
  return { id: 1, email: `${role.toLowerCase()}@example.invalid`, name: `Synthetic ${role.toLowerCase()}`, role }
}

function accessGrant() {
  return {
    accessToken: 'synthetic-memory-only-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    session: {
      absoluteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
      idleTimeoutSeconds: 7200,
    },
  }
}

function classroom() {
  return {
    classroomId: 12,
    name: 'Synthetic classroom',
    instructorName: 'Synthetic instructor',
    startDate: '2026-08-03',
    endDate: '2026-11-15',
    status: 'ACTIVE',
    color: 'BLUE',
    weekCount: 15,
    currentWeek: 6,
    learnerCount: 42,
    averageProgressRate: 38,
    pendingRequestCount: 0,
  }
}
