import { expect, test, type Page } from '@playwright/test'
import { guardianEntry, guardianPendingUser, guardianStatus, guardianView } from '../src/test/guardianFixtures'

const ready = process.env.QA_GUARDIAN_SIGNUP_READY === 'synthetic-ready'
const envelope = (data: unknown) => ({ success: true, data, message: 'synthetic' })
const failure = (code: string) => ({ success: false, error: { code, message: 'synthetic', details: [] } })
const requests = new WeakMap<Page, { path: string; method: string; body: unknown }[]>()
const violations = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  violations.set(page, errors); requests.set(page, [])
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (!url.pathname.startsWith('/api/')) return
    requests.get(page)!.push({ path: url.pathname, method: req.method(), body: req.postData() ? req.postDataJSON() : null })
    if (req.method() !== 'GET' && !['/api/auth/refresh', '/api/auth/signup', '/api/auth/login', '/api/auth/google', '/api/auth/session/activity'].includes(url.pathname)) errors.push(`mutation ${req.method()} ${url.pathname}`)
  })
  await google(page)
  await page.route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url())
    if (url.origin !== 'http://127.0.0.1:4191') { errors.push(`external ${url.origin}`); return route.abort() }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    // Every API is synthetic. Guardian mutations, mail, AI and account writes
    // (apart from the named synthetic auth signup/login) are forbidden.
    return route.fulfill({ status: 404, json: failure('NOT_FOUND') })
  })
})
test.afterEach(({ page }) => { expect(violations.get(page)).toEqual([]) })
async function account(page: Page) {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600 }) }))
  await page.route('**/api/users/me', (route) => route.fulfill({ json: envelope(guardianPendingUser) }))
  await page.route('**/api/auth/email-verification/status', (route) => route.fulfill({ json: envelope({ ...guardianPendingUser, emailVerifiedAt: null }) }))
}
async function anonymous(page: Page) {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, json: failure('TOKEN_INVALID') }))
}
async function localForm(page: Page) {
  await page.route('**/api/auth/email-availability?*', (route) => route.fulfill({ json: envelope({ available: true }) }))
  await page.goto('/signup')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.locator('#signup-name').fill('합성 계정')
  await page.locator('#signup-affiliation').fill('합성 학교')
  await page.locator('#signup-email').fill('synthetic@example.invalid')
  await page.locator('#signup-password').fill('Synthetic123!')
  await page.locator('#signup-confirm-password').fill('Synthetic123!')
  if (ready) await page.getByLabel('생년월일', { exact: true }).fill('2000-02-29')
}
async function google(page: Page) {
  // The Google library and credential are synthetic and entirely in this page.
  await page.addInitScript(() => {
    let callback: ((value: { credential: string }) => void) | undefined
    window.google = { accounts: { id: {
      initialize: (options) => { callback = options.callback },
      renderButton: (parent) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = '합성 Google 로그인'; button.onclick = () => callback?.({ credential: 'synthetic-google-token' }); parent.append(button) },
    } } }
  })
}
test('anonymous guardian route always requires login and never reads cases', async ({ page }) => {
  await anonymous(page)
  await page.goto('/guardian-request')
  await expect(page).toHaveURL(/\/login/)
  expect(requests.get(page)!.filter((r) => r.path.includes('guardian'))).toHaveLength(0)
})
test('pending account guardian entry keeps default OFF hold and exact ON read exception', async ({ page }, info) => {
  await account(page)
  let calls = 0
  await page.route('**/api/users/me/guardian-requests/entry', (route) => { calls++; expect(route.request().method()).toBe('GET'); expect(route.request().headers().authorization).toBe('Bearer synthetic-access'); return route.fulfill({ json: envelope(guardianEntry) }) })
  await page.goto('/guardian-request')
  if (!ready) { await expect(page).toHaveURL('/verify-email'); expect(calls).toBe(0); await expect(page.getByRole('link', { name: '보호자 신청 상태' })).toHaveCount(0); return }
  await expect(page.getByRole('heading', { name: '보호자 확인 신청 상태' })).toBeVisible()
  await expect(page.getByText(/의사 표시가 접수되었습니다/)).toBeVisible()
  await expect(page.getByText('유효한 승인 없음', { exact: true })).toHaveCount(2)
  await expect(page.getByText('회신 방법: 전화 확인')).toBeVisible()
  await expect(page.locator('img')).toHaveCount(0)
  await expect(page.locator('input')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('declared.png'), fullPage: true })
  const before = calls
  await page.getByRole('button', { name: '현재 신청 상태 다시 확인' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect.poll(() => calls).toBe(before + 1)
  await page.getByRole('link', { name: '이메일 확인', exact: true }).click()
  await expect(page).toHaveURL('/verify-email')
  await page.goBack()
  await expect(page).toHaveURL('/guardian-request')
  await expect(page.getByRole('region', { name: '현재 보호자 신청' })).toBeVisible()
  await page.goto('/classrooms')
  await expect(page).toHaveURL('/verify-email')
  expect(requests.get(page)!.some((r) => /materials|sessions.*stream|classrooms/.test(r.path))).toBe(false)
})
test('nullable/stale and separate approval facts stay server-owned with no replayed content', async ({ page }) => {
  test.skip(!ready, 'synthetic-ready only')
  await account(page)
  let entry = { ...guardianEntry, request: { ...guardianView, optionalAiScope: ' \t', status: { ...guardianStatus, state: 'APPROVED' as const, serviceApproved: true, externalAiApproved: false }, replyChannel: null, forms: {} } }
  await page.route('**/api/users/me/guardian-requests/entry', (route) => route.fulfill({ json: envelope(entry) }))
  await page.goto('/guardian-request')
  await expect(page.getByText('승인됨', { exact: true })).toHaveCount(1)
  await expect(page.getByText('유효한 승인 없음', { exact: true })).toHaveCount(1)
  entry = { ...entry, request: { ...entry.request, status: { ...entry.request.status, currentNotice: false, serviceApproved: false } } }
  await page.getByRole('button', { name: '현재 신청 상태 다시 확인' }).click()
  await expect(page.getByText(/안내 설정이 변경되었습니다/)).toBeVisible()
  await expect(page.getByText(/회신 방법:/)).toHaveCount(0)
})
test('LOCAL policy 503 permits one explicit lookup and resubmit without automatic retries', async ({ page }, info) => {
  test.skip(!ready, 'synthetic-ready only')
  await anonymous(page)
  let policies = 0; let signups = 0
  await page.route('**/api/policies/current', (route) => { policies++; return route.fulfill({ json: envelope([]) }) })
  await page.route('**/api/auth/signup', (route) => { signups++; expect(route.request().postDataJSON().consents).toEqual([]); return route.fulfill({ status: 503, json: failure('SIGNUP_POLICY_NOT_READY') }) })
  await localForm(page)
  await page.getByRole('button', { name: '가입 완료' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByText(/가입 정책을 준비 중이어서/)).toBeVisible()
  expect(signups).toBe(1); expect(policies).toBe(1)
  await expect(page.getByRole('button', { name: '가입 완료' })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('policy-503.png'), fullPage: true })
  await page.getByRole('button', { name: '현재 정책 한 번 다시 확인' }).evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByRole('button', { name: '가입 완료' })).toBeEnabled()
  expect(signups).toBe(1); expect(policies).toBe(2)
  await page.getByRole('button', { name: '가입 완료' }).click()
  await expect(page.getByText('이번 화면의 재확인을 사용했습니다. 나중에 다시 방문해 주세요.')).toBeVisible()
  expect(signups).toBe(2)
})
test('LOCAL policy 400 clears choices and requires fresh current consent', async ({ page }) => {
  test.skip(!ready, 'synthetic-ready only')
  await anonymous(page)
  let version = 'synthetic-v1'; let calls = 0
  await page.route('**/api/policies/current', (route) => route.fulfill({ json: envelope([{ type: 'TERMS', version, title: '합성 이용약관', requiresConsent: true }]) }))
  await page.route('**/api/auth/signup', (route) => { calls++; version = 'synthetic-v2'; return route.fulfill({ status: 400, json: failure('POLICY_CONSENT_REQUIRED') }) })
  await localForm(page); await page.getByLabel('합성 이용약관 동의 (필수)').check()
  await page.getByRole('button', { name: '가입 완료' }).click()
  await expect(page.getByText(/정책이 변경되었습니다/)).toBeVisible()
  await expect(page.getByLabel('합성 이용약관 동의 (필수)')).not.toBeChecked()
  await page.getByRole('button', { name: '가입 완료' }).click()
  expect(calls).toBe(1)
})
test('existing Google login stays token-only even when new signup policy is unavailable', async ({ page }) => {
  await anonymous(page); await google(page)
  let calls = 0; let policies = 0
  await page.route('**/api/policies/current', (route) => { policies++; return route.fulfill({ status: 503, json: failure('SIGNUP_POLICY_NOT_READY') }) })
  await page.route('**/api/auth/google', (route) => { calls++; expect(route.request().postDataJSON()).toEqual({ idToken: 'synthetic-google-token' }); return route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600, user: guardianPendingUser }) }) })
  await page.route('**/api/auth/email-verification/status', (route) => route.fulfill({ json: envelope(guardianPendingUser) }))
  await page.route('**/api/users/me', (route) => route.fulfill({ json: envelope(guardianPendingUser) }))
  await page.goto('/login'); await page.getByRole('button', { name: '합성 Google 로그인' }).click()
  await expect(page).toHaveURL('/verify-email')
  expect(calls).toBe(1); expect(policies).toBe(0)
})
test('new Google continuation distinguishes 503 and can cancel without submitting again', async ({ page }) => {
  test.skip(!ready, 'synthetic-ready only')
  await anonymous(page); await google(page)
  let calls = 0
  await page.route('**/api/policies/current', (route) => route.fulfill({ json: envelope([]) }))
  await page.route('**/api/auth/google', (route) => {
    calls++
    return route.fulfill(route.request().postDataJSON().role ? { status: 503, json: failure('SIGNUP_POLICY_NOT_READY') } : { status: 409, json: failure('SIGNUP_REQUIRED') })
  })
  await page.goto('/login'); await page.getByRole('button', { name: '합성 Google 로그인' }).click()
  await expect(page).toHaveURL('/signup')
  await page.getByLabel('생년월일', { exact: true }).fill('2000-02-29')
  await page.getByRole('button', { name: '가입하기' }).click()
  await expect(page.getByText(/가입 정책을 준비 중이어서/)).toBeVisible()
  await expect(page.getByRole('button', { name: '가입하기' })).toBeDisabled()
  expect(calls).toBe(2)
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await expect(page).toHaveURL('/login')
  expect(calls).toBe(2)
})
test('page close aborts pending guardian read and never emits guardian writes', async ({ page }) => {
  test.skip(!ready, 'synthetic-ready only')
  await account(page)
  let resolve!: () => void; let read = false
  await page.route('**/api/users/me/guardian-requests/entry', async (route) => {
    read = true; await new Promise<void>((done) => { resolve = done })
    await route.fulfill({ json: envelope(guardianEntry) }).catch(() => undefined)
  })
  await page.goto('/guardian-request')
  await expect.poll(() => read).toBe(true)
  await page.close(); resolve()
})
