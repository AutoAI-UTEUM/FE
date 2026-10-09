import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, RequireAuth, useAuth } from '../auth'
import { isAccountManagementRequest } from '../auth/launchAuthContract'
import { guardianDetail, guardianEntry, guardianPendingUser, guardianStatus, guardianView } from '../../test/guardianFixtures'
import { confirmationMethodFor, GUARDIAN_TEAM_CONTRACT, guardianLinkMessage, isGuardianManagementRequest, parseGuardianDetail, parseGuardianEntry, parseGuardianLink, parseGuardianStatus, parseGuardianView } from './guardianContract'
import { getGuardianEntry, getGuardianRequest } from './guardianRepository'

beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', '/api'); vi.stubGlobal('BroadcastChannel', undefined) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('pinned guardian contract', () => {
  it.each(['', 'true', 'be-guardian-typo'])('OFF %s rejects both reads before networking and grants no exception', async (value) => {
    vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', value)
    const request = vi.fn()
    await expect(getGuardianEntry(request)).rejects.toMatchObject({ code: 'GUARDIAN_TEAM_UNAVAILABLE' })
    await expect(getGuardianRequest(request)).rejects.toMatchObject({ code: 'GUARDIAN_TEAM_UNAVAILABLE' })
    expect(request).not.toHaveBeenCalled()
    expect(isAccountManagementRequest('/api/users/me/guardian-requests/entry')).toBe(false)
  })
  it('nullable DTOs, no reviewer fields in self view/status, and UTC generation start remain separate from declaration', () => {
    expect(parseGuardianDetail(guardianDetail)).toEqual(guardianDetail)
    expect(parseGuardianView({ ...guardianView, guardianContact: 'discard@example.invalid', userId: 77 })).toEqual(guardianView)
    expect(parseGuardianStatus({ ...guardianStatus, generationStartedAt: guardianDetail.generationStartedAt })).not.toHaveProperty('generationStartedAt')
    expect(guardianDetail.generationStartedAt).not.toEqual(guardianDetail.status.webDeclaredAt)
    expect(parseGuardianEntry({ ...guardianEntry, teamReviewAvailable: false, canStartRequest: false, replyChannel: null, request: null }).request).toBeNull()
    expect(() => parseGuardianEntry({ ...guardianEntry, teamReviewAvailable: false })).toThrow()
    expect(() => parseGuardianStatus({ ...guardianStatus, state: 'UNKNOWN' })).toThrow()
    expect(() => parseGuardianStatus({ ...guardianStatus, serviceApproved: true })).toThrow()
    expect(() => parseGuardianStatus({ ...guardianStatus, state: 'APPROVED', externalAiApproved: true })).toThrow()
    expect(() => parseGuardianDetail({ ...guardianDetail, declaredScopes: null })).toThrow()
    expect(() => parseGuardianDetail({ ...guardianDetail, generationStartedAt: '2026-10-07T10:00:00+09:00' })).toThrow()
  })
  it('maps reply channels explicitly and does not resurrect a replayed null URL', () => {
    expect(confirmationMethodFor('EMAIL_REPLY')).toBe('EMAIL_REPLY')
    expect(confirmationMethodFor('PHONE_CALLBACK')).toBe('PHONE')
    expect(confirmationMethodFor(null)).toBeNull()
    const link = parseGuardianLink({ url: null, expiresAt: null, replayed: true, status: guardianStatus })
    expect(link.url).toBeNull()
    expect(guardianLinkMessage(link)).toContain('새 링크가 없습니다')
  })
  it.each([null, '', ' ', '\t\n', '\u001c\u2003'])('normalizes BE-accepted absent optional AI scope %j in View and Entry', (optionalAiScope) => {
    const view = { ...guardianView, optionalAiScope }
    expect(parseGuardianView(view).optionalAiScope).toBeNull()
    expect(parseGuardianEntry({ ...guardianEntry, request: view }).request?.optionalAiScope).toBeNull()
  })
  it('preserves explicit optional AI scope and rejects nonblank unknown scope', () => {
    expect(parseGuardianView({ ...guardianView, optionalAiScope: 'EXTERNAL_AI' }).optionalAiScope).toBe('EXTERNAL_AI')
    expect(() => parseGuardianView({ ...guardianView, optionalAiScope: 'UNKNOWN' })).toThrow()
    expect(() => parseGuardianView({ ...guardianView, optionalAiScope: undefined })).toThrow()
  })
  it('read repositories use exact self paths with no-store/no-referrer and never mutate', async () => {
    vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', GUARDIAN_TEAM_CONTRACT)
    const request = vi.fn().mockResolvedValueOnce({ data: guardianEntry }).mockResolvedValueOnce({ data: guardianView })
    await expect(getGuardianEntry(request)).resolves.toEqual(guardianEntry)
    await expect(getGuardianRequest(request)).resolves.toEqual(guardianView)
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/users/me/guardian-requests/entry', '/api/users/me/guardian-requests'])
    for (const [, options] of request.mock.calls) expect(options).toMatchObject({ method: 'GET', cache: 'no-store', referrerPolicy: 'no-referrer' })
  })
  const id = guardianStatus.requestId
  it.each([
    ['/api/users/me/guardian-requests/entry', 'GET', true], ['/api/users/me/guardian-requests', 'get', true],
    [`/api/users/me/guardian-requests/${id}/withdraw`, 'POST', true],
    ['/api/users/me/guardian-requests/entry', 'POST', false], ['/api/users/me/guardian-requests', 'POST', false],
    [`/api/users/me/guardian-requests/${id}/link`, 'POST', false], [`/api/users/me/guardian-requests/${id}/withdraw`, 'GET', false],
    ['/api/users/me/guardian-requests/another/withdraw', 'POST', false], ['/api/users/me/guardian-requests/entry/child', 'GET', false],
    ['/api/users/me/guardian-requests/entry/', 'GET', false], ['/api/admin/guardian-requests', 'GET', false],
    ['/api/materials/9/file', 'GET', false], ['/api/sessions/9/stream', 'GET', false],
  ])('narrow pending-account exception %s %s is %s', (path, method, allowed) => {
    vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', GUARDIAN_TEAM_CONTRACT)
    expect(isGuardianManagementRequest(path as string, method as string)).toBe(allowed)
  })
  it.each(['JSON', 'raw'])('%s pending gate allows exact authenticated reads but blocks writes/business before fetch', async (kind) => {
    vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', GUARDIAN_TEAM_CONTRACT)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: guardianEntry, message: 'synthetic' })))
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider initialUser={guardianPendingUser}>{children}</AuthProvider> })
    const request = kind === 'JSON' ? result.current.apiRequest : result.current.rawApiRequest
    await act(async () => { await request('/api/users/me/guardian-requests/entry') })
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get('Authorization')).toBe('Bearer test-access-token')
    for (const [path, method] of [[`/api/users/me/guardian-requests/${id}/link`, 'POST'], ['/api/users/me/guardian-requests', 'POST'], ['/api/materials/9/file', 'GET'], ['/api/sessions/9/stream', 'GET']]) {
      await expect(request(path, { method })).rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_REQUIRED', status: 403 })
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.isAuthenticated).toBe(true)
    // Withdrawal is checked by the matcher only. No withdrawal request is executed.
  })
  it.each([
    [true, true, '/guardian-request', '조회 화면'], [false, true, '/guardian-request', '이메일 안내'],
    [true, false, '/guardian-request', '로그인 안내'], [true, true, '/guardian-request/other', '이메일 안내'],
    [true, true, '/classrooms', '이메일 안내'],
  ])('RequireAuth ON=%s authenticated=%s path=%s preserves gate', (on, authenticated, path, text) => {
    vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', on ? GUARDIAN_TEAM_CONTRACT : '')
    render(<AuthProvider initialUser={authenticated ? guardianPendingUser : null}><MemoryRouter initialEntries={[path as string]}><Routes>
      <Route element={<RequireAuth />}><Route path="*" element={<p>조회 화면</p>} /></Route>
      <Route path="/verify-email" element={<p>이메일 안내</p>} /><Route path="/login" element={<p>로그인 안내</p>} />
    </Routes></MemoryRouter></AuthProvider>)
    expect(screen.getByText(text as string)).toBeInTheDocument()
  })
})
