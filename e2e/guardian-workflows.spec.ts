import { expect, test, type Page } from '@playwright/test'
import { guardianDetail, guardianEntry, guardianPendingUser, guardianStatus, guardianView } from '../src/test/guardianFixtures'
const ready = process.env.QA_GUARDIAN_WORKFLOW_READY === 'synthetic-ready'
const id = guardianStatus.requestId
const token = 'S'.repeat(43)
const envelope = (data: unknown) => ({ success: true, data, message: 'synthetic' })
const failure = (code: string) => ({ success: false, error: { code, message: 'synthetic', details: [] } })
const consentView = { ...guardianView, status: { ...guardianStatus, state: 'AWAITING_CONSENT' as const }, noticeUrl: 'https://notice.example.invalid/synthetic', forms: { consent_email: '합성 서비스 고지·선택 AI·거부 영향·회신 창구', reply_form: '<img src=x onerror=alert(1)> 합성 회신 양식' } }
const violations = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; violations.set(page, errors)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:4193') { errors.push(`external ${url.origin}`); return route.abort() }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (route.request().method() !== 'GET' && !['/api/auth/refresh', '/api/auth/session/activity'].includes(url.pathname)) errors.push(`unmocked mutation ${url.pathname}`)
    return route.fulfill({ status: 401, json: failure('AUTH_REQUIRED') })
  })
})
test.afterEach(({ page }) => expect(violations.get(page)).toEqual([]))
async function account(page: Page, admin = false) {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: envelope({ accessToken: 'synthetic-access', expiresIn: 3600 }) }))
  await page.route('**/api/users/me', (route) => route.fulfill({ json: envelope(admin ? { ...guardianPendingUser, id: 900099, role: 'ADMIN', emailVerificationRequired: false } : guardianPendingUser) }))
  await page.route('**/api/auth/email-verification/status', (route) => route.fulfill({ json: envelope(guardianPendingUser) }))
}
test('default OFF public token scrub and reviewer gate never open write inputs', async ({ page }) => {
  await page.goto(`/guardian-consent#token=${token}`)
  await expect(page).toHaveURL('/guardian-consent')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  if (!ready) { await expect(page.getByText('보호자 후속 절차를 준비하고 있습니다.')).toBeVisible(); await expect(page.locator('input')).toHaveCount(0) }
  else await expect(page.getByRole('button', { name: '현재 안내 확인' })).toBeEnabled()
  await account(page, true); await page.goto('/admin/guardian-requests')
  if (!ready) { await expect(page.getByText('보호자 담당자 절차를 준비하고 있습니다.')).toBeVisible(); await expect(page.locator('input')).toHaveCount(0) }
  else await expect(page.getByRole('button', { name: '담당자 권한·목록 확인' })).toBeVisible()
})
test('self intake then lost link replay and pending-email withdrawal stay exact and confirmed', async ({ page }, info) => {
  test.skip(!ready, 'synthetic-ready only')
  await account(page)
  await page.route('**/api/users/me/guardian-requests/entry', (route) => route.fulfill({ json: envelope({ ...guardianEntry, request: null, canStartRequest: true }) }))
  let intake = 0; const linkBodies: string[] = []; let withdrawals = 0
  await page.route('**/api/users/me/guardian-requests', (route) => { intake++; expect(route.request().method()).toBe('POST'); expect(route.request().postDataJSON()).toMatchObject({ guardianContactProvidedByChild: false }); return route.fulfill({ json: envelope(consentView) }) })
  await page.route(`**/api/users/me/guardian-requests/${id}/link`, (route) => { linkBodies.push(route.request().postData()!); return linkBodies.length === 1 ? route.abort('failed') : route.fulfill({ json: envelope({ url: null, expiresAt: null, replayed: true, status: { ...guardianStatus, revision: 4 } }) }) })
  await page.route(`**/api/users/me/guardian-requests/${id}/withdraw`, (route) => { withdrawals++; expect(route.request().postDataJSON()).toMatchObject({ generation: 2, revision: 4 }); return route.fulfill({ json: envelope({ ...guardianStatus, revision: 5, state: 'REVOKED', reason: 'REQUESTER_WITHDREW' }) }) })
  await page.goto('/guardian-request'); await page.getByLabel('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.').check()
  await page.getByRole('button', { name: '신청 접수 확인' }).click(); expect(intake).toBe(0)
  await page.getByRole('button', { name: '전송 전 취소' }).click(); expect(intake).toBe(0)
  await page.getByRole('button', { name: '신청 접수 확인' }).click(); await page.getByRole('button', { name: '확인 후 전송' }).evaluate((b: HTMLButtonElement) => { b.click(); b.click() })
  await expect(page.getByRole('region', { name: '현재 보호자 신청' })).toBeVisible(); expect(intake).toBe(1)
  await page.getByLabel('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.').check(); await page.getByRole('button', { name: '안내 링크 발급 확인' }).click(); await page.getByRole('button', { name: '확인 후 전송' }).click()
  await expect(page.getByRole('button', { name: '같은 요청 다시 확인' })).toBeVisible(); await expect(page.getByRole('button', { name: '현재 신청 상태 다시 확인' })).toBeDisabled()
  await page.getByRole('button', { name: '같은 요청 다시 확인' }).click(); await expect(page.getByText(/이 응답에는 새 링크가 없습니다/)).toBeVisible(); expect(linkBodies[0]).toBe(linkBodies[1])
  await page.getByLabel('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.').check(); await page.getByRole('button', { name: '신청·승인 철회 확인' }).click(); await page.getByRole('button', { name: '확인 후 전송' }).click()
  await expect(page.getByText('신청 또는 승인이 철회되었습니다.', { exact: true })).toBeVisible(); expect(withdrawals).toBe(1)
  await page.screenshot({ path: info.outputPath('self-withdrawn.png'), fullPage: true })
})
test('public consent loss retries identical body without cookies and leaves DECLARED unapproved', async ({ page, context }, info) => {
  test.skip(!ready, 'synthetic-ready only')
  await context.addCookies([{ name: 'synthetic-cookie', value: 'unused', domain: '127.0.0.1', path: '/' }])
  const bodies: string[] = []; let views = 0
  await page.route('**/api/auth/guardian-team/view', (route) => { views++; expect(route.request().headers().cookie).toBeUndefined(); return route.fulfill({ json: envelope(consentView) }) })
  await page.route('**/api/auth/guardian-team/consent', (route) => { bodies.push(route.request().postData()!); expect(route.request().headers().authorization).toBeUndefined(); expect(route.request().headers().cookie).toBeUndefined(); return bodies.length === 1 ? route.abort('failed') : route.fulfill({ json: envelope(guardianStatus) }) })
  await page.goto(`/guardian-consent#token=${token}`); await expect(page).toHaveURL('/guardian-consent'); expect(views).toBe(0)
  await page.getByRole('button', { name: '현재 안내 확인' }).click(); await page.getByLabel('서비스 이용 동의 (필수)').check(); await page.getByLabel('현재 신청 대상의 법정대리인임을 선언합니다.').check(); await page.getByRole('combobox', { name: '관계', exact: true }).selectOption('PARENT')
  await expect(page.getByLabel('외부 AI 이용 동의 (선택)')).not.toBeChecked()
  await page.getByRole('button', { name: '의사 표시 제출 확인' }).click(); await page.getByRole('button', { name: '확인 후 전송' }).click(); await page.getByRole('button', { name: '같은 요청 다시 확인' }).click()
  await expect(page.getByText(/소비된 링크로 다시 조회하지 않습니다/)).toBeVisible(); expect(bodies[0]).toBe(bodies[1]); expect(JSON.parse(bodies[0]).scopes).toEqual(['SERVICE']); expect(views).toBe(1)
  await expect(page.getByText('유효한 승인 없음', { exact: true })).toHaveCount(2); await expect(page.locator('img')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('public-declared.png'), fullPage: true })
})
test('public stale/query links close all inputs and do not reuse token after back', async ({ page }) => {
  test.skip(!ready, 'synthetic-ready only')
  let views = 0
  await page.route('**/api/auth/guardian-team/view', (route) => { views++; return route.fulfill({ json: envelope({ ...consentView, status: { ...consentView.status, currentNotice: false }, forms: {}, replyChannel: null, noticeUrl: null }) }) })
  await page.goto(`/guardian-consent#token=${token}`); await page.getByRole('button', { name: '현재 안내 확인' }).click(); await expect(page.getByText(/현재 고지·필수 범위·회신 창구가 충분하지/)).toBeVisible(); await expect(page.locator('input')).toHaveCount(0)
  await page.goto(`/guardian-consent?token=invalid#token=${token}`); await expect(page).toHaveURL('/guardian-consent'); await expect(page.getByRole('button', { name: '현재 안내 확인' })).toBeDisabled(); expect(views).toBe(1)
  await page.goBack(); await expect(page.getByRole('button', { name: '현재 안내 확인' })).toBeDisabled()
})
test('reviewer permission then PHONE confirmation, current-revision approval and separate AI scope', async ({ page }, info) => {
  test.skip(!ready, 'synthetic-ready only')
  await account(page, true)
  let detail = { ...guardianDetail, relationship: 'PARENT' as const, declaredScopes: ['SERVICE'], forms: { consent_email: '합성 고지·범위·확인 기준', approved: '합성 승인 양식 미리 보기' } }
  let forbidden = true; let confirms = 0; let decisions = 0
  await page.route('**/api/admin/guardian-requests?*', (route) => forbidden ? route.fulfill({ status: 403, json: failure('ACCESS_DENIED') }) : route.fulfill({ json: envelope({ content: [detail.status], page: 0, size: 20, totalElements: 1, totalPages: 1 }) }))
  await page.route(`**/api/admin/guardian-requests/${id}`, (route) => route.fulfill({ json: envelope(detail) }))
  await page.route(`**/api/admin/guardian-requests/${id}/confirmation`, (route) => { confirms++; expect(route.request().postDataJSON()).toMatchObject({ method: 'PHONE', scopes: ['SERVICE'], generation: 2, revision: 3, responseReceivedAt: '2026-10-08T01:00:00Z' }); detail = { ...detail, confirmationMethod: 'PHONE', evidenceReference: 'synthetic.case-001', status: { ...detail.status, revision: 4, state: 'REVIEW_PENDING', explicitResponseAt: '2026-10-08T01:00:00Z' } }; return route.fulfill({ json: envelope(detail.status) }) })
  await page.route(`**/api/admin/guardian-requests/${id}/decision`, (route) => { decisions++; expect(route.request().postDataJSON()).toMatchObject({ generation: 2, revision: 4, decision: 'APPROVE' }); detail = { ...detail, status: { ...detail.status, revision: 5, state: 'APPROVED', serviceApproved: true, externalAiApproved: false } }; return route.fulfill({ json: envelope(detail.status) }) })
  await page.goto('/admin/guardian-requests'); await page.getByRole('button', { name: '담당자 권한·목록 확인' }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('region', { name: '담당자 상세' })).toHaveCount(0)
  forbidden = false; await page.getByRole('button', { name: '담당자 권한·목록 확인' }).click(); await page.getByRole('button', { name: `상세 ${id}` }).click()
  await page.getByLabel(/운영 고지·관계 확인/).check(); await page.getByRole('combobox', { name: '관계', exact: true }).selectOption('PARENT'); await page.getByLabel('확인 범위 SERVICE').check(); await page.getByRole('textbox', { name: '제한된 증거 참조', exact: true }).fill('synthetic.case-001'); await page.getByLabel('실제 회신 수신 시각 (UTC ISO)').fill('2026-10-08T01:00:00Z')
  for (const text of [/회신 신청번호·차수/, /실제 회신·통화에/, /법정대리인 선언을/, /고지 버전·범위와/, /현재 확인 수단과/]) await page.getByLabel(text).check()
  await page.getByRole('button', { name: '명시적 회신 등록 확인' }).click(); await expect(page.getByRole('button', { name: '담당자 권한·목록 확인' })).toBeDisabled(); await page.getByRole('button', { name: '확인 후 전송' }).click()
  await expect(page.getByText(/수정번호 4/).first()).toBeVisible(); await expect(page.getByLabel(/운영 고지·관계 확인/)).not.toBeChecked(); await page.getByLabel(/운영 고지·관계 확인/).check()
  for (const text of [/승인된 운영 기준에/, /회신 연락처와/, /현재 차수의 제한된/, /현재 고지와 승인할/]) await page.getByLabel(text).check()
  await page.getByRole('button', { name: '최종 승인 확인' }).click(); await page.getByRole('button', { name: '확인 후 전송' }).click(); await expect(page.getByText('서비스 승인: 승인됨 · 외부 AI 승인: 유효한 승인 없음')).toBeVisible(); expect(confirms).toBe(1); expect(decisions).toBe(1)
  await page.screenshot({ path: info.outputPath('review-approved.png'), fullPage: true })
})
test('pending email account still cannot reach reviewer or business routes', async ({ page }) => {
  await account(page)
  await page.goto('/admin/guardian-requests'); await expect(page).toHaveURL('/verify-email')
  await page.goto('/classrooms'); await expect(page).toHaveURL('/verify-email')
})
