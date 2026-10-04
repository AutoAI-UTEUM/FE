import { expect, test, type BrowserContext } from '@playwright/test'

const enabled = process.env.QA_AUTH_CONTRACT_READINESS === 'be-auth-ee69e425-v1'
const token = 'A'.repeat(43)
const user = { id: 900003, name: 'synthetic', role: 'LEARNER', email: 'account-b@example.invalid',
  emailVerification: 'PENDING', emailVerificationRequired: true, emailVerifiedAt: null }
const envelope = (data: unknown) => ({ success: true, data, message: 'synthetic' })
const invalid = { success: false, error: { code: 'EMAIL_VERIFICATION_TOKEN_INVALID', message: 'synthetic invalid', details: [] } }

async function mockAnonymous(context: BrowserContext) {
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/refresh') return route.fulfill({ status: 401, json: { success: false, error: { code: 'TOKEN_INVALID', message: 'synthetic', details: [] } } })
    return route.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_FOUND', message: 'synthetic', details: [] } } })
  })
}

test.beforeEach(async ({ context }) => {
  test.skip((process.env.QA_ENV ?? 'mock') !== 'mock', 'synthetic local-only test')
  await mockAnonymous(context)
})

test('opening/prefetching link never confirms; URL/history/storage/referrer are scrubbed', async ({ page, context }) => {
  const requests: { url: string; method: string; referer: string | undefined }[] = []
  context.on('request', (request) => requests.push({ url: request.url(), method: request.method(), referer: request.headers().referer }))
  await page.goto(`/verify-email?token=${token}&returnTo=unsafe#token=${token}`)
  await expect(page.getByRole('heading', { name: '이메일 확인', exact: true })).toBeVisible()
  await expect(page).toHaveURL('/verify-email')
  expect(requests.filter((request) => request.url.includes('/email-verification/confirm'))).toHaveLength(0)
  expect(requests.filter((request) => request.referer?.includes(token))).toHaveLength(0)
  expect(await page.evaluate(() => JSON.stringify({ state: history.state, local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(token)
  if (!enabled) {
    await expect(page.getByText('이메일 확인 기능을 준비 중입니다.', { exact: false })).toBeVisible()
    expect(requests.some((request) => request.url.includes('/email-verification/') || request.url.includes('/policies/'))).toBe(false)
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: '이메일 확인', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '이메일 확인하기' })).toHaveCount(0)
})

test('explicit confirm is single POST and creates no login session', async ({ page }) => {
  test.skip(!enabled, 'readiness OFF')
  let calls = 0
  await page.route('**/api/auth/email-verification/confirm', async (route) => {
    calls++
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ token })
    expect(route.request().headers().authorization).toBeUndefined()
    await route.fulfill({ json: envelope({ emailVerification: 'VERIFIED', emailVerificationRequired: false, emailVerifiedAt: '2026-10-04T10:00:00Z' }) })
  })
  await page.goto(`/verify-email?token=${token}`)
  await page.getByRole('button', { name: '이메일 확인하기' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByText('링크에 연결된 계정의 이메일을 확인했습니다.', { exact: false })).toBeVisible()
  expect(calls).toBe(1)
  await expect(page.getByRole('link', { name: '계정 관리' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '이메일 확인하기' })).toHaveCount(0)
})

test('encoded and uppercase verify routes scrub tokens before router matching', async ({ page }) => {
  await page.goto(`/%76erify-email?token=${token}`)
  await expect(page.getByRole('heading', { name: '이메일 확인', exact: true })).toBeVisible()
  await expect(page).toHaveURL('/verify-email')
  await page.goto(`/VERIFY-EMAIL/?token=${token}`)
  await expect(page.getByRole('heading', { name: '이메일 확인', exact: true })).toBeVisible()
  await expect(page).toHaveURL('/verify-email')
})

for (const scenario of ['expired', 'reissued', 'used']) {
  test(`${scenario} tokens share the invalid-link message and are cleared`, async ({ page }) => {
    test.skip(!enabled, 'readiness OFF')
    await page.route('**/api/auth/email-verification/confirm', (route) => route.fulfill({ status: 400, json: invalid }))
    await page.goto(`/verify-email?token=${token}`)
    await page.getByRole('button', { name: '이메일 확인하기' }).click()
    await expect(page.getByText('유효하지 않거나 만료된 링크입니다.', { exact: false })).toBeVisible()
    expect(await page.evaluate(() => window.__uteumEmailLink?.read() ?? null)).toBeNull()
  })
}

test('another-account confirm reloads own status/me; 202 and 429 never claim delivery or count down', async ({ page }) => {
  test.skip(!enabled, 'readiness OFF')
  const authCalls: string[] = []
  let resend = 0
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    authCalls.push(path)
    if (path === '/api/auth/refresh') return route.fulfill({ json: envelope({ accessToken: 'synthetic-access-not-a-jwt', expiresIn: 3600 }) })
    if (path === '/api/users/me') return route.fulfill({ json: envelope(user) })
    if (path.endsWith('/status')) {
      expect(route.request().headers().authorization).toBe('Bearer synthetic-access-not-a-jwt')
      return route.fulfill({ json: envelope({ emailVerification: 'PENDING', emailVerificationRequired: true, emailVerifiedAt: null }) })
    }
    if (path.endsWith('/confirm')) return route.fulfill({ json: envelope({ emailVerification: 'VERIFIED', emailVerificationRequired: false, emailVerifiedAt: '2026-10-04T10:00:00Z' }) })
    if (path.endsWith('/request')) {
      resend++
      return route.fulfill(resend === 1 ? { status: 202, json: envelope(null) }
        : { status: 429, json: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'synthetic', details: [] } } })
    }
    return route.fulfill({ json: envelope(null) })
  })
  await page.goto(`/verify-email?token=${token}`)
  await expect(page.getByText('현재 로그인 계정: account-b@example.invalid')).toBeVisible()
  const before = authCalls.filter((path) => path === '/api/users/me').length
  await page.getByRole('button', { name: '이메일 확인하기' }).click()
  await expect.poll(() => authCalls.filter((path) => path === '/api/users/me').length).toBeGreaterThan(before)
  await expect(page.getByText('현재 계정의 이메일 확인이 필요합니다.')).toBeVisible()
  await expect(page.getByText('현재 계정의 이메일 확인이 완료되었습니다.')).toHaveCount(0)
  await page.getByRole('button', { name: '확인 이메일 다시 요청' }).click()
  await expect(page.getByText('발송·수신 완료를 의미하지 않습니다.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '확인 이메일 다시 요청' }).click()
  await expect(page.getByText('요청이 많습니다. 잠시 후 직접 다시 시도해 주세요.')).toBeVisible()
  expect(authCalls.filter((path) => path === '/api/auth/logout')).toHaveLength(0)
  expect(authCalls.filter((path) => path === '/api/auth/refresh')).toHaveLength(1)
  await page.getByRole('link', { name: '계정 관리' }).click()
  await expect(page).toHaveURL('/settings')
})

test('LOCAL new signup submits DOB and current required policies only', async ({ page }) => {
  test.skip(!enabled, 'readiness OFF')
  let body: unknown
  await page.route('**/api/policies/current', (route) => route.fulfill({ json: envelope([
    { type: 'TERMS', version: 'synthetic-1', title: '합성 이용약관', requiresConsent: true },
    { type: 'PRIVACY', version: 'synthetic-2', title: '합성 개인정보처리방침', requiresConsent: false },
  ]) }))
  await page.route('**/api/auth/email-availability?*', (route) => route.fulfill({ json: envelope({ available: true }) }))
  await page.route('**/api/auth/signup', async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: envelope({ userId: 900004, emailVerification: 'PENDING', emailVerificationRequired: true }) }) })
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600, user }) }))
  await page.route('**/api/users/me', (route) => route.fulfill({ json: envelope(user) }))
  await page.route('**/api/auth/email-verification/status', (route) => route.fulfill({ json: envelope({ emailVerification: 'PENDING', emailVerificationRequired: true, emailVerifiedAt: null }) }))
  await page.goto('/signup')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.locator('#signup-name').fill('합성 학습자')
  await page.locator('#signup-affiliation').fill('합성 학교')
  await page.locator('#signup-email').fill('synthetic@example.invalid')
  await page.locator('#signup-password').fill('Synthetic123!')
  await page.locator('#signup-confirm-password').fill('Synthetic123!')
  await page.getByLabel('생년월일', { exact: true }).fill('2015-01-02')
  await page.getByLabel('합성 이용약관 동의 (필수)').check()
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/verify-email')
  expect(body).toMatchObject({ dateOfBirth: '2015-01-02', consents: [{ type: 'TERMS', version: 'synthetic-1' }] })
})

test('readiness OFF keeps old LOCAL signup without DOB/policies', async ({ page }) => {
  test.skip(enabled, 'default-OFF compatibility')
  let body: Record<string, unknown> | undefined
  const oldUser = { id: user.id, email: user.email, name: user.name, role: user.role }
  await page.route('**/api/auth/email-availability?*', (route) => route.fulfill({ json: envelope({ available: true }) }))
  await page.route('**/api/auth/signup', async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: envelope({ userId: user.id }) }) })
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600, user: oldUser }) }))
  await page.goto('/signup')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.getByLabel('생년월일', { exact: true })).toHaveCount(0)
  await page.locator('#signup-name').fill('합성 학습자')
  await page.locator('#signup-affiliation').fill('합성 학교')
  await page.locator('#signup-email').fill('synthetic@example.invalid')
  await page.locator('#signup-password').fill('Synthetic123!')
  await page.locator('#signup-confirm-password').fill('Synthetic123!')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/classrooms')
  expect(body).not.toHaveProperty('dateOfBirth')
  expect(body).not.toHaveProperty('consents')
})

for (const state of ['UNKNOWN', 'PENDING']) {
  test(`legacy ${state}/required=false remains usable without verified UI`, async ({ page }) => {
    test.skip(!enabled, 'readiness OFF')
    const legacy = { ...user, emailVerification: state, emailVerificationRequired: false }
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/refresh') return route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600 }) })
      return route.fulfill({ json: envelope(path.endsWith('/status') ? {
        emailVerification: state, emailVerificationRequired: false, emailVerifiedAt: null,
      } : legacy) })
    })
    await page.goto('/verify-email')
    await expect(page.getByText('이메일 확인 완료 기록은 없으며 현재 계정은 이용할 수 있습니다.')).toBeVisible()
    await expect(page.getByText('현재 계정의 이메일 확인이 완료되었습니다.')).toHaveCount(0)
    await expect(page.getByRole('link', { name: '강의실', exact: true })).toBeVisible()
  })
}

test('another tab confirmation is reflected by own status/me on focus', async ({ page, context }) => {
  test.skip(!enabled, 'readiness OFF')
  let verified = false
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const status = { emailVerification: verified ? 'VERIFIED' : 'PENDING', emailVerificationRequired: !verified,
      emailVerifiedAt: verified ? '2026-10-04T10:00:00Z' : null }
    if (path === '/api/auth/refresh') return route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600 }) })
    if (path === '/api/users/me') return route.fulfill({ json: envelope({ ...user, ...status }) })
    if (path.endsWith('/confirm')) {
      verified = true
      return route.fulfill({ json: envelope({ ...status, emailVerification: 'VERIFIED', emailVerificationRequired: false }) })
    }
    return route.fulfill({ json: envelope(status) })
  })
  await page.goto('/verify-email')
  await expect(page.getByText('현재 계정의 이메일 확인이 필요합니다.')).toBeVisible()
  const second = await context.newPage()
  await second.goto(`/verify-email?token=${token}`)
  await second.getByRole('button', { name: '이메일 확인하기' }).click()
  await expect(second.getByText('현재 계정의 이메일 확인이 완료되었습니다.')).toBeVisible()
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('현재 계정의 이메일 확인이 완료되었습니다.')).toBeVisible()
})
