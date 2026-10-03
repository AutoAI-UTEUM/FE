import { expect, test, type BrowserContext, type Route } from '@playwright/test'

const calendarProjects = ['chromium-1440', 'phone-390']

for (const projectName of calendarProjects) {
  test(`keyboard mutation recovery stays isolated at ${projectName}`, async ({ baseURL, context, page }, testInfo) => {
    test.skip(testInfo.project.name !== projectName, `이 시나리오는 ${projectName} 전용입니다.`)
    const fixture = await installCalendarFixtures(context, new URL(baseURL!).origin)

    await page.goto('/calendar')
    await expect(page.getByRole('heading', { name: '캘린더' })).toBeVisible()
    await expect(page.getByText('등록된 일정이 없습니다.')).toBeVisible()

    const addOpener = page.getByRole('button', { name: '일정 추가' })
    await addOpener.focus()
    await page.keyboard.press('Enter')
    const composer = page.getByRole('dialog', { name: '일정 추가' })
    const title = composer.getByRole('textbox', { name: '일정 이름' })
    await expect(title).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(composer.getByRole('button', { name: '일정 추가 닫기' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(composer.getByRole('button', { name: '취소' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(composer).toBeHidden()
    await expect(addOpener).toBeFocused()

    await page.keyboard.press('Enter')
    await composer.getByRole('textbox', { name: '일정 이름' }).fill('브라우저 일정')
    await composer.getByRole('button', { name: '추가', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('합성 생성 실패')).toBeVisible()
    await expect(composer).toBeVisible()
    await expect(composer.getByRole('textbox', { name: '일정 이름' })).toHaveValue('브라우저 일정')

    await composer.getByRole('button', { name: '추가', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(composer).toBeHidden()
    await expect(page.getByText('일정을 추가했습니다.')).toBeVisible()
    expect(fixture.createAttempts()).toBe(2)

    const eventOpener = page.getByRole('button', { name: /브라우저 일정,/ }).first()
    await eventOpener.focus()
    await page.keyboard.press('Enter')
    const details = page.getByRole('dialog', { name: '브라우저 일정' })
    await expect(details.getByRole('button', { name: '일정 상세 닫기' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(details.getByRole('button', { name: '일정 삭제' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(details.getByRole('button', { name: '일정 상세 닫기' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(eventOpener).toBeFocused()

    await page.keyboard.press('Enter')
    await details.getByRole('button', { name: '일정 수정' }).focus()
    await page.keyboard.press('Enter')
    const editComposer = page.getByRole('dialog', { name: '일정 수정' })
    await editComposer.getByRole('textbox', { name: '일정 이름' }).fill('저장하지 않을 제목')
    await editComposer.getByRole('button', { name: '취소' }).focus()
    await page.keyboard.press('Enter')
    await expect(editComposer).toBeHidden()
    expect(fixture.patchAttempts()).toBe(0)
    await expect(page.getByRole('button', { name: /브라우저 일정,/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /저장하지 않을 제목,/ })).toHaveCount(0)

    await page.getByRole('button', { name: /브라우저 일정,/ }).first().focus()
    await page.keyboard.press('Enter')
    await details.getByRole('button', { name: '일정 삭제' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('합성 삭제 실패')).toBeVisible()
    await expect(details).toBeVisible()
    await expect(details.getByRole('button', { name: '일정 삭제' })).toBeEnabled()
    expect(fixture.deleteAttempts()).toBe(1)

    const widths = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }))
    expect(Math.max(widths.body, widths.document) - widths.viewport).toBeLessThanOrEqual(2)
    fixture.assertIsolated()
  })
}

async function installCalendarFixtures(context: BrowserContext, origin: string) {
  const externalRequests: string[] = []
  const unexpectedApi: string[] = []
  let createAttemptCount = 0
  let deleteAttemptCount = 0
  let patchAttemptCount = 0

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
      await ok(route, { email: 'calendar@example.invalid', id: 17, name: '합성 강의자', role: 'INSTRUCTOR' })
      return
    }
    if (url.pathname === '/api/users/me/notifications') {
      await ok(route, pageOf([]))
      return
    }
    if (url.pathname === '/api/classrooms' && request.method() === 'GET') {
      await ok(route, pageOf([]))
      return
    }
    if (url.pathname === '/api/users/me/schedule' && request.method() === 'GET') {
      await ok(route, { items: [] })
      return
    }
    if (url.pathname === '/api/users/me/schedule' && request.method() === 'POST') {
      createAttemptCount += 1
      if (createAttemptCount === 1) {
        await fail(route, 500, 'SYNTHETIC_CREATE_FAILURE', '합성 생성 실패')
        return
      }
      const body = request.postDataJSON() as { endsAt: string; hasTime: boolean; startsAt: string; title: string }
      await ok(route, { ...body, kind: 'PERSONAL', scheduleId: 'synthetic-calendar-1' })
      return
    }
    if (url.pathname === '/api/users/me/schedule/synthetic-calendar-1' && request.method() === 'PATCH') {
      patchAttemptCount += 1
      unexpectedApi.push(`${request.method()} ${url.pathname}`)
      await fail(route, 500, 'UNEXPECTED_PATCH', '취소한 편집은 전송되면 안 됩니다.')
      return
    }
    if (url.pathname === '/api/users/me/schedule/synthetic-calendar-1' && request.method() === 'DELETE') {
      deleteAttemptCount += 1
      await fail(route, 500, 'SYNTHETIC_DELETE_FAILURE', '합성 삭제 실패')
      return
    }
    unexpectedApi.push(`${request.method()} ${url.pathname}${url.search}`)
    await fail(route, 501, 'UNEXPECTED_FIXTURE_REQUEST', '예상하지 않은 합성 요청입니다.')
  })

  return {
    assertIsolated() {
      expect(unexpectedApi, '모든 API 요청은 명시적인 합성 fixture여야 합니다.').toEqual([])
      expect(externalRequests, '외부 요청은 없어야 합니다.').toEqual([])
    },
    createAttempts: () => createAttemptCount,
    deleteAttempts: () => deleteAttemptCount,
    patchAttempts: () => patchAttemptCount,
  }
}

async function ok(route: Route, data: unknown) {
  await route.fulfill({
    body: JSON.stringify({ data, message: '합성 fixture', success: true }),
    contentType: 'application/json',
    status: 200,
  })
}

async function fail(route: Route, status: number, code: string, message: string) {
  await route.fulfill({
    body: JSON.stringify({ error: { code, details: [], message }, success: false }),
    contentType: 'application/json',
    status,
  })
}

function pageOf(items: unknown[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: items.length ? 1 : 0 }
}

function accessGrant() {
  return {
    accessToken: 'synthetic-calendar-memory-only-token',
    expiresIn: 3600,
    session: {
      absoluteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
      idleTimeoutSeconds: 7200,
    },
    tokenType: 'Bearer',
  }
}
