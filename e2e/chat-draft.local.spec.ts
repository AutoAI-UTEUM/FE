import { expect, test, type Page } from '@playwright/test'

import { loginAs, qaEnvironment } from './qa-helpers'

test.describe('volatile chat question drafts', () => {
  test.beforeEach(() => {
    test.skip(qaEnvironment !== 'mock', 'synthetic browser regression only')
  })

  test('restores an unsent question after SPA navigation and browser back', async ({ page }) => {
    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100')
    const question = page.locator('#chat-question')
    await expect(question).toBeVisible()
    await question.fill('synthetic unsent question')

    await page.locator('a[href="/classrooms"]:visible').first().click()
    await expect(page).toHaveURL(/\/classrooms$/)
    await page.goBack()

    await expect(page).toHaveURL(/\/sessions\/100$/)
    await expect(page.locator('#chat-question')).toHaveValue('synthetic unsent question')
  })

  test('does not expose an unsent question in another session', async ({ page }) => {
    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100')
    await page.locator('#chat-question').fill('session 100 only')

    await spaNavigate(page, '/sessions/102')
    await expect(page.locator('#chat-question')).toHaveValue('')
    await page.goBack()

    await expect(page).toHaveURL(/\/sessions\/100$/)
    await expect(page.locator('#chat-question')).toHaveValue('session 100 only')
  })

  test('removes a submitted question before SPA navigation and browser back', async ({ page }) => {
    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100')
    const question = page.locator('#chat-question')
    await question.fill('synthetic submitted question')
    await question.press('Enter')
    await expect(question).toHaveValue('')

    await page.locator('a[href="/classrooms"]:visible').first().click()
    await expect(page).toHaveURL(/\/classrooms$/)
    await page.goBack()

    await expect(page.locator('#chat-question')).toHaveValue('')
  })

  test('isolates a retained draft from a different user after SPA logout and login', async ({ page }) => {
    await installSyntheticAuth(page)
    await login(page, 'first@example.com')
    await spaNavigate(page, '/sessions/100')
    await page.locator('#chat-question').fill('first user secret draft')

    await logout(page)
    await login(page, 'second@example.com')
    await spaNavigate(page, '/sessions/100')
    await expect(page.locator('#chat-question')).toHaveValue('')

    await logout(page)
    await login(page, 'first@example.com')
    await spaNavigate(page, '/sessions/100')
    await expect(page.locator('#chat-question')).toHaveValue('first user secret draft')
  })

  test('does not apply a delayed turn response from the previous owner after logout and login', async ({ page }) => {
    let releaseOldTurn: (() => void) | undefined
    const oldTurnCanFinish = new Promise<void>((resolve) => { releaseOldTurn = resolve })
    let turnPosts = 0

    await installSyntheticAuth(page)
    await page.route('**/api/sessions/100/stream', (route) => route.fulfill({
      body: [
        'event: ready',
        'data: {"sessionId":100,"connectedAt":"2026-10-03T00:00:00Z"}',
        '',
        'event: completed',
        'data: {"result":{"messages":[],"uiActions":[]}}',
        '',
        '',
      ].join('\n'),
      contentType: 'text/event-stream',
    }))
    await page.route('**/api/sessions/100/turns', async (route) => {
      turnPosts += 1
      await oldTurnCanFinish
      try {
        await route.fulfill({
          json: success({
            messages: [{
              content: '첫 번째 사용자에게만 속한 늦은 답변',
              createdAt: '2026-10-03T00:00:01Z',
              messageId: 920,
              senderType: 'AI',
              status: 'COMPLETED',
            }],
            state: {},
            uiActions: [],
          }),
        })
      } catch {
        // The previous owner's AbortSignal may close the intercepted request first.
      }
    })

    await login(page, 'first@example.com')
    await spaNavigate(page, '/sessions/100')
    await page.locator('#chat-question').fill('첫 사용자 전용 질문')
    await page.getByRole('button', { name: '질문 보내기' }).click()
    await expect.poll(() => turnPosts).toBe(1)

    await logout(page)
    await login(page, 'second@example.com')
    await spaNavigate(page, '/sessions/100')
    releaseOldTurn?.()

    await expect(page.locator('#chat-question')).toBeEnabled()
    await expect(page.locator('#chat-question')).toHaveValue('')
    await expect(page.getByRole('log').locator('article').filter({
      hasText: '첫 번째 사용자에게만 속한 늦은 답변',
    })).toHaveCount(0)
    await page.waitForTimeout(250)
    expect(turnPosts).toBe(1)
  })
})

async function spaNavigate(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`))
}

async function installSyntheticAuth(page: Page) {
  let currentUser: { email: string; id: number; name: string; role: 'LEARNER' } | null = null
  await page.route('**/api/auth/refresh', async (route) => {
    if (!currentUser) {
      await route.fulfill({
        status: 401,
        json: { success: false, error: { code: 'TOKEN_INVALID', message: 'Synthetic signed out' } },
      })
      return
    }
    await route.fulfill({ json: success(accessGrant()) })
  })
  await page.route('**/api/auth/login', async (route) => {
    const email = String(route.request().postDataJSON().email)
    currentUser = {
      email,
      id: email === 'first@example.com' ? 11 : 22,
      name: email === 'first@example.com' ? 'First synthetic user' : 'Second synthetic user',
      role: 'LEARNER',
    }
    await route.fulfill({ json: success({ ...accessGrant(), user: currentUser }) })
  })
  await page.route('**/api/auth/logout', async (route) => {
    currentUser = null
    await route.fulfill({ json: success(null) })
  })
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill(currentUser
      ? { json: success(currentUser) }
      : { status: 401, json: { success: false, error: { code: 'TOKEN_INVALID', message: 'Synthetic signed out' } } })
  })
}

async function login(page: Page, email: string) {
  if (!/\/login(?:\?|$)/.test(page.url())) await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill('synthetic-password')
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/classrooms$/)
}

async function logout(page: Page) {
  await page.getByRole('button', { name: '프로필 메뉴', exact: true }).first().click()
  await page.getByRole('menuitem', { name: '로그아웃' }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
}

function accessGrant() {
  return {
    accessToken: 'synthetic-token',
    expiresIn: 3600,
    session: {
      absoluteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
      idleTimeoutSeconds: 7200,
    },
    tokenType: 'Bearer',
  }
}

function success(data: unknown) {
  return { success: true, message: 'Synthetic fixture', data }
}
