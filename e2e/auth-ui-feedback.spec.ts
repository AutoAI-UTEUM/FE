import { expect, test } from '@playwright/test'

const envelope = (data: unknown) => ({ success: true, data, message: 'synthetic' })
const terms = '이용약관 0.9 — 법무 검토 전 초안 · 긴 정책 제목도 작은 화면에서 모두 읽을 수 있어야 합니다'
const token = 'A'.repeat(43)
const nextToken = 'B'.repeat(43)
const verifiedUser = { id: 900003, name: '합성 학습자', role: 'LEARNER', email: 'verified@example.invalid',
  emailVerification: 'VERIFIED', emailVerificationRequired: false, emailVerifiedAt: '2026-11-06T00:00:00Z' }

test.beforeEach(async ({ context }) => {
  // Never contact a remote service. All mutations below have an explicit local mock.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') throw new Error('Auth UI QA must remain localhost-only')
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401,
      json: { success: false, error: { code: 'TOKEN_INVALID', message: 'synthetic', details: [] } } })
    return route.continue()
  })
})

test('policy cards preserve explicit required consent and readable, bounded full text', async ({ page }, info) => {
  await page.route('**/api/policies/current', (route) => route.fulfill({ json: envelope([
    { type: 'TERMS', version: 'synthetic-1', title: terms, requiresConsent: true },
    { type: 'PRIVACY', version: 'synthetic-1', title: '개인정보처리방침 0.9 — 법무 검토 전 초안', requiresConsent: false },
  ]) }))
  const fullText = '[합성 초안] 수집 항목과 보관·파기 안내를 확인하세요.\n'.repeat(30) + 'https://example.invalid/' + 'long-path-'.repeat(45)
  await page.route('**/api/policies/TERMS/synthetic-1', (route) => route.fulfill({ json: envelope({ content: fullText }) }))
  await page.goto('/signup')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  const consent = page.getByRole('checkbox', { name: `${terms} 동의 (필수)` })
  await expect(consent).not.toBeChecked()
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(page.getByText('열람 안내 · 별도 가입 동의 대상이 아닙니다.')).toBeVisible()
  await page.getByRole('button', { name: `${terms} 전문 보기` }).click()
  const content = page.getByLabel('정책 전문', { exact: true })
  await expect(content).toContainText('[합성 초안]')
  await expect.poll(() => content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await content.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('policy-cards.png'), fullPage: true })
  await page.getByRole('button', { name: '정책 전문 닫기' }).click()
  await expect(content).toHaveCount(0)
  await expect(consent).not.toBeChecked()
  await consent.check()
  await expect(consent).toBeChecked()
})

test('an explicitly verified current account has one login action and no resend or management actions', async ({ page }, info) => {
  let writes = 0
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/refresh')) return route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600 }) })
    if (route.request().method() !== 'GET') writes++
    return route.fulfill({ json: envelope(path.endsWith('/status') ? {
      emailVerification: 'VERIFIED', emailVerificationRequired: false, emailVerifiedAt: verifiedUser.emailVerifiedAt,
    } : verifiedUser) })
  })
  await page.goto('/verify-email')
  const heading = page.getByRole('heading', { name: '이메일 인증 완료' })
  await expect(heading).toBeVisible()
  const panel = heading.locator('../..')
  await expect(panel.getByRole('link')).toHaveCount(1)
  await expect(panel.getByRole('link', { name: '로그인', exact: true })).toHaveAttribute('href', '/login')
  await expect(panel.getByRole('button')).toHaveCount(0)
  expect(writes).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('verified-login-only.png'), fullPage: true })
})

test('a completed link does not make a replacement invalid link look successful', async ({ page }, info) => {
  const bodies: unknown[] = []
  await page.route('**/api/auth/email-verification/confirm', (route) => {
    bodies.push(route.request().postDataJSON())
    expect(route.request().headers().authorization).toBeUndefined()
    return route.fulfill(bodies.length === 1 ? { json: envelope(null) } : { status: 400,
      json: { success: false, error: { code: 'EMAIL_VERIFICATION_TOKEN_INVALID', message: 'synthetic', details: [] } } })
  })
  await page.goto(`/verify-email#token=${token}`)
  await expect(page.getByRole('button', { name: '이메일 확인하기' })).toBeVisible()
  expect(bodies).toHaveLength(0)
  await page.getByRole('button', { name: '이메일 확인하기' }).click()
  await expect(page.getByRole('heading', { name: '이메일 인증 완료' })).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('confirmed-link.png'), fullPage: true })
  await page.evaluate((replacement) => {
    history.pushState({ idx: 1, key: 'synthetic-replacement' }, '', `/verify-email#token=${replacement}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, nextToken)
  await expect(page.getByRole('button', { name: '이메일 확인하기' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '이메일 인증 완료' })).toHaveCount(0)
  expect(bodies).toHaveLength(1)
  await page.getByRole('button', { name: '이메일 확인하기' }).click()
  await expect(page.getByRole('status').filter({ hasText: '유효하지 않거나 만료된 링크입니다.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '이메일 인증 완료' })).toHaveCount(0)
  expect(bodies).toEqual([{ token }, { token: nextToken }])
})
