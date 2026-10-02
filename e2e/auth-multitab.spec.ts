import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { qaEnvironment } from './qa-helpers'

const user = { id: 1, name: '학습자', email: 'learner@example.com', role: 'LEARNER' }
const channelName = 'edupilot-auth-session'

// Separate real pages share the browser's native BroadcastChannel/Web Locks.
// Only API responses are mocked: this does not claim production cookie/auth QA.
test.describe('multi-tab authentication regressions', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(qaEnvironment !== 'mock', 'controlled auth races must only run against local mock')
    await context.route('**/api/auth/refresh', (route) => route.fulfill({ json: envelope(accessGrant()) }))
    await context.route('**/api/users/me', (route) => route.fulfill({ json: envelope(user) }))
    await context.route('**/api/auth/logout', (route) => route.fulfill({ json: envelope(null) }))
  })

  test('a new tab logout clears an older tab with a higher revision', async ({ page, context }) => {
    await page.goto('/classrooms')
    await expect(page.getByRole('heading', { name: '내 강의실', exact: true })).toBeVisible()
    await page.evaluate(({ name, grant }) => {
      const channel = new BroadcastChannel(name)
      channel.postMessage({ type: 'REFRESH_SUCCEEDED', cause: 'refresh', grant, receivedAt: Date.now(), revision: 50, userId: 1 })
      channel.close()
    }, { name: channelName, grant: accessGrant() })

    const second = await context.newPage()
    await second.goto('/classrooms')
    await expect(second.getByRole('heading', { name: '내 강의실', exact: true })).toBeVisible()
    await logout(second)

    await expect(second).toHaveURL(/\/login(?:\?|$)/)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByLabel('이메일')).toBeVisible()
  })

  test('both tabs restore when one user lookup is slower than the shared grant broadcast', async ({ context }) => {
    const slow = await context.newPage()
    let releaseUser!: () => void
    const userGate = new Promise<void>((resolve) => { releaseUser = resolve })
    let userRequested!: () => void
    const requested = new Promise<void>((resolve) => { userRequested = resolve })
    await slow.route('**/api/users/me', async (route) => {
      userRequested()
      await userGate
      await route.fulfill({ json: envelope(user) })
    })
    await slow.goto('/classrooms')
    await requested
    // The pending tab listens before the faster tab broadcasts its restoration.
    await observeNextGrant(slow)
    const fast = await context.newPage()
    await fast.goto('/classrooms')
    await expect(fast.getByRole('heading', { name: '내 강의실', exact: true })).toBeVisible()
    await expect(slow.locator('html')).toHaveAttribute('data-qa-grant-received', 'true')
    releaseUser()

    await expect(slow.getByRole('heading', { name: '내 강의실', exact: true })).toBeVisible()
    await expect(slow).toHaveURL(/\/classrooms$/)
  })

  test('a logout prevents delayed user lookup from restoring the cleared session', async ({ context }) => {
    const active = await authenticatedPage(context)
    const slow = await context.newPage()
    let releaseUser!: () => void
    const gate = new Promise<void>((resolve) => { releaseUser = resolve })
    let userRequested!: () => void
    const requested = new Promise<void>((resolve) => { userRequested = resolve })
    await slow.route('**/api/users/me', async (route) => {
      userRequested()
      await gate
      await route.fulfill({ json: envelope(user) })
    })
    await slow.goto('/classrooms')
    await requested
    await logout(active)
    await expect(active).toHaveURL(/\/login(?:\?|$)/)
    releaseUser()
    await expect(slow).toHaveURL(/\/login(?:\?|$)/)
  })
})

async function authenticatedPage(context: BrowserContext) {
  const page = await context.newPage()
  await page.goto('/classrooms')
  await expect(page.getByRole('heading', { name: '내 강의실', exact: true })).toBeVisible()
  return page
}

async function logout(page: Page) {
  const bottomNavigation = page.getByRole('navigation', { name: '하단 주요 메뉴' })
  const bottomProfileButton = bottomNavigation.getByRole('button', { name: '프로필 메뉴' })
  if (await bottomProfileButton.isVisible().catch(() => false)) {
    await bottomProfileButton.click()
    await bottomNavigation.getByRole('menuitem', { name: '로그아웃', exact: true }).click()
    return
  }

  const menuButtons = page.locator('button[aria-haspopup="menu"]:visible')
  if (await menuButtons.count()) {
    await menuButtons.last().click()
    await page.getByRole('complementary').getByRole('menuitem', { name: '로그아웃', exact: true }).click()
    return
  }

  await page.locator('a[href="/settings"]:visible').click()
  await page.getByRole('button', { name: '로그아웃', exact: true }).click()
}

async function observeNextGrant(page: Page) {
  await page.evaluate((name) => {
    const channel = new BroadcastChannel(name)
    channel.onmessage = (event) => {
      if (event.data.type === 'REFRESH_SUCCEEDED') {
        document.documentElement.dataset.qaGrantReceived = 'true'
        channel.close()
      }
    }
  }, channelName)
}

function accessGrant() {
  return { accessToken: 'mock-shared-token', expiresIn: 3600, session: {
    absoluteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    idleExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
    idleTimeoutSeconds: 7200,
  } }
}

function envelope(data: unknown) { return { success: true, data, message: 'Mock success' } }
