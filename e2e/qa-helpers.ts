import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'

export type QaRole = 'ADMIN' | 'INSTRUCTOR' | 'LEARNER'
export type QaEnvironment = 'dev' | 'mock' | 'prod'

export const qaEnvironment = (process.env.QA_ENV ?? 'mock') as QaEnvironment
const qaApiCapabilities = new Set(
  (process.env.QA_API_CAPABILITIES ?? 'reports,policy-consent')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)

export function hasQaApiCapability(capability: string): boolean {
  return qaApiCapabilities.has(capability.toLowerCase())
}

export function credentialsFor(role: QaRole): { email: string; password: string } | null {
  if (qaEnvironment === 'mock') {
    return { email: `${role.toLowerCase()}@example.com`, password: 'password123' }
  }

  const prefix = `${qaEnvironment.toUpperCase()}_QA_${role}`
  const email = process.env[`${prefix}_EMAIL`]
  const password = process.env[`${prefix}_PASSWORD`]
  return email && password ? { email, password } : null
}

export async function loginAs(page: Page, role: QaRole): Promise<boolean> {
  const credentials = credentialsFor(role)
  if (!credentials) return false

  if (qaEnvironment === 'mock') {
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ error: { code: 'TOKEN_INVALID', message: 'mock signed out' }, success: false }),
        contentType: 'application/json',
        status: 401,
      })
    })
  }

  await page.goto('/login')
  await page.getByLabel('이메일').fill(credentials.email)
  await page.locator('#login-password').fill(credentials.password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
  if (qaEnvironment === 'mock') {
    await page.unroute('**/api/auth/refresh')
    await page.route('**/api/users/me', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: { email: `${role.toLowerCase()}@example.com`, id: 1, name: role.toLowerCase(), role },
          message: '요청이 성공했습니다.',
          success: true,
        }),
        contentType: 'application/json',
        status: 200,
      })
    })
  }
  return true
}

export async function waitForAppSettled(page: Page) {
  const loading = page.getByText('페이지를 불러오는 중입니다.', { exact: true })
  await loading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
  await expect(loading, 'application bootstrap must finish').toBeHidden()
  await page.waitForTimeout(250)
}

export function monitorPage(page: Page) {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  const serverErrors: string[] = []

  page.on('console', (message) => {
    const text = message.text()
    const ignoredThirdPartyCors = text.includes('accounts.google.com/gsi/style') || text.includes('ssl.gstatic.com/_/gsi/')
    const expectedMockNavigationCancellation = qaEnvironment === 'mock'
      && text.includes('due to access control checks.')
    if (message.type() === 'error' && !text.startsWith('Failed to load resource:') && !ignoredThirdPartyCors && !expectedMockNavigationCancellation) {
      consoleErrors.push(text)
    }
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'failed'
    const expectedCancellation = errorText.includes('ERR_ABORTED')
      || errorText.includes('NS_BINDING_ABORTED')
      || errorText.includes('Load request cancelled')
    const ignoredThirdPartyAsset = request.url().includes('accounts.google.com/gsi/') || request.url().includes('ssl.gstatic.com/_/gsi/')
    if (!request.url().includes('/api/auth/refresh') && !expectedCancellation && !ignoredThirdPartyAsset) {
      failedRequests.push(`${request.method()} ${redactUrl(request.url())}: ${errorText}`)
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${redactUrl(response.url())}`)
    }
  })

  return {
    assertClean() {
      expect.soft(consoleErrors, 'browser console/page errors').toEqual([])
      expect.soft(failedRequests, 'failed network requests').toEqual([])
      expect.soft(serverErrors, 'HTTP 5xx responses').toEqual([])
    },
  }
}

export async function assertPageHealthy(page: Page, testInfo: TestInfo, options: { axe?: boolean } = {}) {
  await waitForAppSettled(page)
  await expect(page.locator('body')).not.toBeEmpty()
  await expect(page.locator('body')).not.toContainText('Application error')
  await expect(page.locator('body')).not.toContainText('ChunkLoadError')

  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    textLength: document.body.innerText.trim().length,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(layout.textLength, 'page must render visible text').toBeGreaterThan(0)
  expect.soft(layout.bodyWidth - layout.viewportWidth, 'page-level horizontal overflow').toBeLessThanOrEqual(2)

  const overlappingPageSections = await page.locator('[data-page-container="standard"] > header').evaluateAll((headers) => (
    headers.flatMap((header) => {
      let content = header.nextElementSibling
      while (content) {
        const style = window.getComputedStyle(content)
        const rect = content.getBoundingClientRect()
        if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) break
        content = content.nextElementSibling
      }
      if (!content) return []

      const headerRect = header.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      if (contentRect.top >= headerRect.bottom - 0.5) return []

      return [{
        contentTop: Math.round(contentRect.top * 10) / 10,
        headerBottom: Math.round(headerRect.bottom * 10) / 10,
        title: header.querySelector('h1')?.textContent?.trim() ?? '제목 없음',
      }]
    })
  ))
  expect.soft(overlappingPageSections, 'page title headers must not overlap following content').toEqual([])

  if (/^(phone|tablet)-/.test(testInfo.project.name)) {
    const undersizedTargets = await page.locator('button, a[href], input, select, textarea, [role="button"]').evaluateAll((elements) => (
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        const visuallyHidden = style.opacity === '0' || (rect.width <= 2 && rect.height <= 2)
        if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0 || rect.height === 0 || visuallyHidden) return []
        if (rect.width >= 44 && rect.height >= 44) return []
        return [{
          height: Math.round(rect.height * 10) / 10,
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || element.tagName,
          tag: element.tagName.toLowerCase(),
          width: Math.round(rect.width * 10) / 10,
        }]
      })
    ))
    if (undersizedTargets.length > 0) {
      await testInfo.attach('undersized-touch-targets.json', {
        body: Buffer.from(JSON.stringify(undersizedTargets, null, 2)),
        contentType: 'application/json',
      })
    }
    expect.soft(undersizedTargets.slice(0, 30), 'visible touch targets must be at least 44x44 CSS pixels').toEqual([])
  }

  if (options.axe !== false) {
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = scan.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')
    if (serious.length > 0) {
      await testInfo.attach('accessibility-violations.json', {
        body: Buffer.from(JSON.stringify(serious, null, 2)),
        contentType: 'application/json',
      })
    }
    expect.soft(serious, 'serious or critical accessibility violations').toEqual([])
  }
}

export async function installProductionMutationGuard(page: Page): Promise<string[]> {
  const violations: string[] = []
  if (qaEnvironment !== 'prod') return violations

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const pathname = new URL(request.url()).pathname
    const allowedMutation = ['/api/auth/login', '/api/auth/logout', '/api/auth/refresh'].includes(pathname)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !allowedMutation) {
      violations.push(`${method} ${pathname}`)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  return violations
}

function redactUrl(value: string): string {
  const url = new URL(value)
  url.search = ''
  return url.toString()
}
