import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../auth'
import { guardianDetail, guardianEntry, guardianPendingUser, guardianStatus, guardianView } from '../../test/guardianFixtures'
import { GuardianRequestPage } from '../../app/pages/GuardianRequestPage'
import { GuardianConsentPage } from '../../app/pages/GuardianConsentPage'
import { GuardianReviewPage } from '../../app/pages/GuardianReviewPage'
import { GUARDIAN_POLICY_REVIEW, GUARDIAN_TEAM_CONTRACT, GUARDIAN_WORKFLOW_CONTRACT, isGuardianManagementRequest, parseGuardianList } from './guardianContract'
import { createGuardianOperation, getPublicGuardianView, sendGuardianOperation } from './guardianWorkflowRepository'
import { clearGuardianLinkToken, readGuardianLinkToken } from './guardianLinkToken'
import { useGuardianOperation } from './useGuardianOperation'
import { ApiClientError } from '../../shared/api'

const token = 'S'.repeat(43)
const id = guardianStatus.requestId
const publicView = { ...guardianView, status: { ...guardianStatus, state: 'AWAITING_CONSENT' as const }, noticeUrl: 'https://notice.example.invalid/review', forms: { consent_email: '합성 서비스 고지와 선택 AI 안내', reply_form: '<img src=x onerror=alert(1)> 합성 회신 양식' } }
const detail = { ...guardianDetail, relationship: 'PARENT' as const, declaredScopes: ['SERVICE'], forms: { consent_email: '합성 고지·범위·확인 기준', approved: '합성 승인 양식 미리 보기' } }
const success = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: 'synthetic' }))
const failure = (status: number, code = 'ACCESS_DENIED') => new Response(JSON.stringify({ success: false, error: { code, message: 'synthetic', details: [] } }), { status })
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api'); vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', GUARDIAN_TEAM_CONTRACT)
  vi.stubEnv('VITE_GUARDIAN_WORKFLOW_READINESS', GUARDIAN_WORKFLOW_CONTRACT); vi.stubEnv('VITE_GUARDIAN_POLICY_REVIEW_READINESS', GUARDIAN_POLICY_REVIEW)
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => { cleanup(); clearGuardianLinkToken(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function page(element: React.ReactNode, admin = false) { return render(<StrictMode><AuthProvider initialUser={admin ? { ...guardianPendingUser, id: 900099, role: 'ADMIN', emailVerificationRequired: false } : guardianPendingUser}><MemoryRouter>{element}</MemoryRouter></AuthProvider></StrictMode>) }
function publicPage() { window.history.replaceState(null, '', `/guardian-consent#token=${token}`); return page(<GuardianConsentPage />) }
async function loadPublic() { fireEvent.click(screen.getByRole('button', { name: '현재 안내 확인' })); await screen.findByLabelText('서비스 이용 동의 (필수)') }
function choosePublic() { fireEvent.click(screen.getByLabelText('서비스 이용 동의 (필수)')); fireEvent.click(screen.getByLabelText('현재 신청 대상의 법정대리인임을 선언합니다.')); fireEvent.change(screen.getByLabelText('관계'), { target: { value: 'PARENT' } }) }
async function loadDetail() { fireEvent.click(screen.getByRole('button', { name: '담당자 권한·목록 확인' })); fireEvent.click(await screen.findByRole('button', { name: `상세 ${id}` })); await screen.findByRole('region', { name: '담당자 상세' }) }
function mockReview(write?: Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).includes('?page=')) return success({ content: [guardianStatus], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    if (options?.method === 'POST') return write ?? success({ ...guardianStatus, revision: 4, state: 'REVIEW_PENDING' })
    return success(detail)
  })
}
it.each(['', 'true', 'typo'])('write OFF %j forbids networking and new pending exceptions', async (flag) => {
  vi.stubEnv('VITE_GUARDIAN_WORKFLOW_READINESS', flag)
  const request = vi.fn()
  await expect(sendGuardianOperation(request, { command: 'withdraw', requestId: id, body: '{}' }, new AbortController().signal)).rejects.toMatchObject({ code: 'GUARDIAN_TEAM_UNAVAILABLE' })
  expect(request).not.toHaveBeenCalled()
  expect(isGuardianManagementRequest('/api/users/me/guardian-requests', 'POST')).toBe(false)
  page(<GuardianReviewPage />, true); expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('unattested policy keeps public and reviewer writes closed despite technical readiness', async () => {
  vi.stubEnv('VITE_GUARDIAN_POLICY_REVIEW_READINESS', '')
  const fetch = vi.spyOn(globalThis, 'fetch')
  publicPage(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled()
  await expect(getPublicGuardianView(token, new AbortController().signal)).rejects.toMatchObject({ code: 'GUARDIAN_TEAM_UNAVAILABLE' })
})
it.each([
  ['/api/users/me/guardian-requests', 'POST', true], [`/api/users/me/guardian-requests/${id}/link`, 'POST', true],
  [`/api/users/me/guardian-requests/${id}/link`, 'GET', false], [`/api/users/me/guardian-requests/${id}/link/child`, 'POST', false],
  ['/api/users/me/guardian-requests/not-a-uuid/link', 'POST', false], ['/api/users/me/guardian-requests/entry', 'POST', false],
  ['/api/admin/guardian-requests', 'GET', false], [`/api/admin/guardian-requests/${id}/decision`, 'POST', false],
])('precise newly approved matcher %s %s -> %s', (path, method, allowed) => expect(isGuardianManagementRequest(path as string, method as string)).toBe(allowed))
it('list validates nullable status and rejects malformed pagination', () => {
  expect(parseGuardianList({ content: [guardianStatus], page: 0, size: 20, totalElements: 1, totalPages: 1 }).content).toEqual([guardianStatus])
  expect(() => parseGuardianList({ content: [], page: -1, size: 20, totalElements: 0, totalPages: 0 })).toThrow()
})
it.each(['intake', 'link', 'withdraw', 'consent', 'confirmation', 'decision', 'revoke'] as const)('repository %s is exact method, no-store and guarded UUID', async (command) => {
  const data = command === 'intake' ? guardianView : command === 'link' ? { url: null, expiresAt: null, replayed: true, status: guardianStatus } : guardianStatus
  const request = vi.fn().mockResolvedValue({ data })
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(success(data))
  const operation = createGuardianOperation(command, ['consent', 'intake'].includes(command) ? null : id, { generation: 2, revision: 3, token })
  await sendGuardianOperation(request, operation, new AbortController().signal)
  if (command === 'consent') { expect(request).not.toHaveBeenCalled(); expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', method: 'POST' }); expect(new Headers(fetch.mock.calls[0][1]?.headers).has('Authorization')).toBe(false) }
  else { expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', body: operation.body, cache: 'no-store', referrerPolicy: 'no-referrer' }); expect(request.mock.calls[0][0]).toContain(command === 'intake' ? '/api/users/me/guardian-requests' : `/${id}/${command}`) }
  expect(() => createGuardianOperation(command, '../other', {})).toThrow()
})
it('operation double-click sends once, lost response retries exact serialized body/key, pagehide aborts', async () => {
  let reject!: (error: unknown) => void
  const request = vi.fn().mockImplementationOnce(() => new Promise((_, no) => { reject = no })).mockResolvedValue({ data: guardianStatus })
  const onSuccess = vi.fn(); const onInvalidate = vi.fn()
  const { result } = renderHook(() => useGuardianOperation(request, onSuccess, onInvalidate))
  const fields = { generation: 2, revision: 3 }
  act(() => result.current.prepare(createGuardianOperation('withdraw', id, fields)))
  fields.revision = 99
  act(() => { void result.current.send(); void result.current.send() })
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => reject(new ApiClientError({ code: 'NETWORK_ERROR', message: 'synthetic' })))
  expect(result.current.uncertain).toBe(true)
  await act(async () => result.current.send())
  expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body)
  expect(JSON.parse(request.mock.calls[1][1].body).revision).toBe(3)
  expect(onSuccess).toHaveBeenCalledTimes(1); expect(onInvalidate).not.toHaveBeenCalled()
  request.mockImplementation(() => new Promise(() => {}))
  act(() => result.current.prepare(createGuardianOperation('withdraw', id, { generation: 2, revision: 3 })))
  act(() => { void result.current.send() }); act(() => window.dispatchEvent(new Event('pagehide')))
  expect(request.mock.calls[2][1].signal.aborted).toBe(true); expect(result.current.operation).toBeNull()
})
it('self intake has no contact inputs; final confirmation cancel and uncertain reload lock preserve key', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success({ ...guardianEntry, canStartRequest: true, request: null })).mockRejectedValueOnce(new TypeError('lost')).mockResolvedValue(success(guardianView))
  page(<GuardianRequestPage />)
  fireEvent.click(await screen.findByLabelText('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.'))
  fireEvent.click(screen.getByRole('button', { name: '신청 접수 확인' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '전송 전 취소' })); expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '신청 접수 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  await screen.findByRole('button', { name: '같은 요청 다시 확인' })
  expect(screen.getByRole('button', { name: '현재 신청 상태 다시 확인' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '같은 요청 다시 확인' })); await screen.findByRole('region', { name: '현재 보호자 신청' })
  const first = JSON.parse(fetch.mock.calls[1][1]!.body as string); const second = JSON.parse(fetch.mock.calls[2][1]!.body as string)
  expect(first).toEqual(second); expect(first.guardianContactProvidedByChild).toBe(false); expect(first).not.toHaveProperty('guardianContact')
})
it.each([[409, 'GUARDIAN_STATE_CONFLICT'], [403, 'ACCESS_DENIED'], [503, 'GUARDIAN_TEAM_UNAVAILABLE'], [429, 'RATE_LIMIT_EXCEEDED']])('self %s clears data but preserves error at parent', async (status, code) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(guardianEntry)).mockResolvedValue(failure(status as number, code as string))
  page(<GuardianRequestPage />); fireEvent.click(await screen.findByLabelText('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.'))
  fireEvent.click(screen.getByRole('button', { name: '신청·승인 철회 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument()
})
it('public fragment is removed, no mount POST, explicit view omits cookies/Bearer; DECLARED never approves', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(publicView)).mockResolvedValue(success(guardianStatus))
  publicPage(); expect(window.location.hash).toBe(''); expect(fetch).not.toHaveBeenCalled()
  await loadPublic(); expect(screen.getByLabelText('외부 AI 이용 동의 (선택)')).not.toBeChecked(); choosePublic()
  fireEvent.click(screen.getByRole('button', { name: '의사 표시 제출 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  await screen.findByText(/소비된 링크로 다시 조회하지 않습니다/)
  expect(fetch).toHaveBeenCalledTimes(2)
  for (const [, options] of fetch.mock.calls) { expect(options?.credentials).toBe('omit'); expect(new Headers(options?.headers).has('Authorization')).toBe(false) }
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string).scopes).toEqual(['SERVICE'])
  expect(screen.getAllByText('유효한 승인 없음')).toHaveLength(2); expect(window.__uteumGuardianLink).toBeUndefined()
})
it('public notice refresh clears all earlier choices before showing a newer notice', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(publicView)).mockResolvedValueOnce(success({ ...publicView, status: { ...publicView.status, revision: 4, noticeVersion: 'synthetic-v2' } }))
  publicPage(); await loadPublic(); choosePublic(); fireEvent.click(screen.getByLabelText('외부 AI 이용 동의 (선택)'))
  fireEvent.click(screen.getByRole('button', { name: '현재 안내 확인' })); await screen.findByText(/synthetic-v2/)
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked()
  expect(screen.getByRole('combobox')).toHaveValue(''); expect(screen.getByRole('button', { name: '의사 표시 제출 확인' })).toBeDisabled()
})
it('public decline contains no name/contact/scopes and is explicitly confirmed', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(publicView)).mockResolvedValue(success({ ...guardianStatus, state: 'REJECTED', reason: 'CONSENT_DECLINED' }))
  publicPage(); await loadPublic(); fireEvent.click(screen.getByRole('button', { name: '동의 거절 확인' })); expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' })); await screen.findByText(/응답된 서버 상태/)
  const body = JSON.parse(fetch.mock.calls[1][1]!.body as string)
  expect(body).toMatchObject({ accepted: false, declaresLegalGuardian: false, relationship: null, scopes: [] }); expect(body).not.toHaveProperty('guardianName')
})
it.each(['stale', 'missing-notice', 'tbd'])('public %s closes inputs/submission', async (kind) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ ...publicView, status: { ...publicView.status, currentNotice: kind !== 'stale' }, noticeUrl: kind === 'missing-notice' ? null : publicView.noticeUrl, forms: kind === 'tbd' ? { consent_email: '[[TBD]]' } : publicView.forms }))
  publicPage(); fireEvent.click(screen.getByRole('button', { name: '현재 안내 확인' })); await screen.findByText(/현재 고지·필수 범위·회신 창구가 충분하지/)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})
it('public query token is rejected even with valid fragment', () => {
  window.history.replaceState(null, '', `/guardian-consent?token=unsafe#token=${token}`)
  expect(readGuardianLinkToken()).toBeNull(); expect(window.location.search).toBe(''); expect(window.location.hash).toBe('')
})
it('reviewer list 403 does not disclose or open actions from stale ADMIN role', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(failure(403))
  page(<GuardianReviewPage />, true); fireEvent.click(screen.getByRole('button', { name: '담당자 권한·목록 확인' }))
  await screen.findByRole('alert'); expect(screen.queryByRole('region', { name: '담당자 상세' })).not.toBeInTheDocument(); expect(fetch).toHaveBeenCalledTimes(1)
})
it('reviewer confirmation uses typed PHONE, actual UTC and manually checked same declared scopes', async () => {
  const fetch = mockReview(); page(<GuardianReviewPage />, true); await loadDetail()
  expect(screen.getByRole('button', { name: '명시적 회신 등록 확인' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/운영 고지·관계 확인/)); fireEvent.change(screen.getByLabelText('관계'), { target: { value: 'PARENT' } }); fireEvent.click(screen.getByLabelText('확인 범위 SERVICE'))
  fireEvent.change(screen.getByLabelText('제한된 증거 참조'), { target: { value: 'case.synthetic-001' } }); fireEvent.change(screen.getByLabelText('실제 회신 수신 시각 (UTC ISO)'), { target: { value: '2026-10-08T01:00:00Z' } })
  for (const label of [/회신 신청번호·차수/, /실제 회신·통화에/, /법정대리인 선언을/, /고지 버전·범위와/, /현재 확인 수단과/]) fireEvent.click(screen.getByLabelText(label))
  fireEvent.click(screen.getByRole('button', { name: '명시적 회신 등록 확인' })); expect(screen.getByRole('button', { name: '담당자 권한·목록 확인' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' })); await waitFor(() => expect(fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true))
  const body = JSON.parse(fetch.mock.calls.find(([, o]) => o?.method === 'POST')![1]!.body as string)
  expect(body).toMatchObject({ method: 'PHONE', generation: 2, revision: 3, scopes: ['SERVICE'], responseReceivedAt: '2026-10-08T01:00:00Z' })
})
it.each([403, 409, 503])('reviewer decision %s wipes contact and shows parent error', async (status) => {
  mockReview(failure(status, status === 503 ? 'GUARDIAN_TEAM_UNAVAILABLE' : status === 409 ? 'GUARDIAN_STATE_CONFLICT' : 'ACCESS_DENIED')); page(<GuardianReviewPage />, true); await loadDetail(); fireEvent.click(screen.getByLabelText(/운영 고지·관계 확인/))
  fireEvent.click(screen.getByRole('button', { name: '반려 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  await screen.findByRole('alert'); expect(screen.queryByRole('region', { name: '담당자 상세' })).not.toBeInTheDocument(); expect(screen.queryByLabelText('제한된 증거 참조')).not.toBeInTheDocument()
})
it('stale reviewer can revoke with current coordinates but never confirm or approve', async () => {
  const stale = { ...detail, status: { ...detail.status, currentNotice: false }, forms: {}, replyChannel: null }
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success({ content: [stale.status], page: 0, size: 20, totalElements: 1, totalPages: 1 })).mockResolvedValueOnce(success(stale)).mockResolvedValue(success({ ...guardianStatus, revision: 4, state: 'REVOKED', reason: 'OPERATOR_REVOKED' }))
  page(<GuardianReviewPage />, true); await loadDetail(); fireEvent.click(screen.getByLabelText(/운영 고지·관계 확인/))
  expect(screen.getByRole('button', { name: '명시적 회신 등록 확인' })).toBeDisabled(); expect(screen.getByRole('button', { name: '최종 승인 확인' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('사유'), { target: { value: 'OPERATOR_REVOKED' } }); fireEvent.click(screen.getByRole('button', { name: '담당자 철회 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  await waitFor(() => expect(fetch.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(1))
  expect(JSON.parse(fetch.mock.calls.find(([, o]) => o?.method === 'POST')![1]!.body as string)).toMatchObject({ generation: 2, revision: 3, reason: 'OPERATOR_REVOKED' })
})
it('public uncertain consent locks choices and retries exact body without another view', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(publicView)).mockRejectedValueOnce(new TypeError('response lost')).mockResolvedValue(success(guardianStatus))
  publicPage(); await loadPublic(); choosePublic(); fireEvent.click(screen.getByRole('button', { name: '의사 표시 제출 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  await screen.findByRole('button', { name: '같은 요청 다시 확인' }); expect(screen.getByLabelText('외부 AI 이용 동의 (선택)')).toBeDisabled(); expect(screen.getByRole('button', { name: '현재 안내 확인' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '같은 요청 다시 확인' })); await screen.findByText(/소비된 링크로 다시 조회하지 않습니다/)
  expect(fetch.mock.calls[1][1]!.body).toBe(fetch.mock.calls[2][1]!.body); expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/view'))).toHaveLength(1)
})
it('reviewer lost decision cannot erase key through list/detail refresh', async () => {
  let writes = 0
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).includes('?page=')) return success({ content: [guardianStatus], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    if (options?.method === 'POST') { writes++; if (writes === 1) throw new TypeError('response lost'); return success({ ...guardianStatus, revision: 4, state: 'NEEDS_INFORMATION', reason: 'INCOMPLETE_RESPONSE' }) }
    return success(detail)
  })
  page(<GuardianReviewPage />, true); await loadDetail(); fireEvent.click(screen.getByLabelText(/운영 고지·관계 확인/)); fireEvent.click(screen.getByRole('button', { name: '보완 요청 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  await screen.findByRole('button', { name: '같은 요청 다시 확인' }); expect(screen.getByRole('button', { name: '담당자 권한·목록 확인' })).toBeDisabled(); expect(screen.getByRole('button', { name: `상세 ${id}` })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '같은 요청 다시 확인' })); await waitFor(() => expect(writes).toBe(2))
  const posts = fetch.mock.calls.filter(([, o]) => o?.method === 'POST'); expect(posts[0][1]!.body).toBe(posts[1][1]!.body)
})
it('self replayed null URL never resurrects a previous successful link', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(guardianEntry))
    .mockResolvedValueOnce(success({ url: `https://synthetic.example.invalid/guardian-consent#token=${token}`, expiresAt: null, replayed: false, status: { ...guardianStatus, revision: 4 } }))
    .mockResolvedValueOnce(success({ url: null, expiresAt: null, replayed: true, status: { ...guardianStatus, revision: 5 } }))
  page(<GuardianRequestPage />); await screen.findByRole('region', { name: '현재 보호자 신청' })
  for (let n = 0; n < 2; n++) { fireEvent.click(screen.getByLabelText('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.')); fireEvent.click(screen.getByRole('button', { name: '안내 링크 발급 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' })); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(n + 2)); await waitFor(() => expect(screen.queryByRole('region', { name: '최종 확인' })).not.toBeInTheDocument()) }
  expect(screen.queryByText(`https://synthetic.example.invalid/guardian-consent#token=${token}`)).not.toBeInTheDocument(); expect(screen.getByText(/이 응답에는 새 링크가 없습니다/)).toBeInTheDocument()
})
function ChangeAccount() { const { updateUser } = useAuth(); return <button onClick={() => updateUser({ ...guardianPendingUser, id: 900002, email: 'second@example.invalid' })}>합성 계정 전환</button> }
it('account switch aborts pending self write and ignores its late approval result', async () => {
  let release!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(guardianEntry)).mockImplementationOnce(() => new Promise((resolve) => { release = resolve })).mockResolvedValue(success({ ...guardianEntry, request: null, canStartRequest: true }))
  page(<><ChangeAccount /><GuardianRequestPage /></>); fireEvent.click(await screen.findByLabelText('신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.')); fireEvent.click(screen.getByRole('button', { name: '신청·승인 철회 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  fireEvent.click(screen.getByRole('button', { name: '합성 계정 전환' })); expect(fetch.mock.calls[1][1]!.signal!.aborted).toBe(true)
  await act(async () => release(success({ ...guardianStatus, state: 'APPROVED', serviceApproved: true })))
  await screen.findByRole('button', { name: '신청 접수 확인' }); expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument()
})
it('pagehide aborts public submit, wipes token and ignores late success', async () => {
  let release!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(publicView)).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
  publicPage(); await loadPublic(); choosePublic(); fireEvent.click(screen.getByRole('button', { name: '의사 표시 제출 확인' })); fireEvent.click(screen.getByRole('button', { name: '확인 후 전송' }))
  act(() => window.dispatchEvent(new Event('pagehide'))); expect(fetch.mock.calls[1][1]!.signal!.aborted).toBe(true)
  await act(async () => release(success(guardianStatus))); expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument(); expect(window.__uteumGuardianLink).toBeUndefined()
})
it.each([500, 502, 503])('unknown infrastructure %s keeps identical request rather than claiming unprepared', async (status) => {
  const request = vi.fn().mockRejectedValueOnce(new ApiClientError({ status, code: 'UPSTREAM_FAILURE', message: 'synthetic' })).mockResolvedValue({ data: guardianStatus })
  const invalidate = vi.fn()
  const { result } = renderHook(() => useGuardianOperation(request, vi.fn(), invalidate))
  act(() => result.current.prepare(createGuardianOperation('withdraw', id, { generation: 2, revision: 3 })))
  await act(async () => result.current.send()); expect(result.current.uncertain).toBe(true); expect(invalidate).not.toHaveBeenCalled()
  await act(async () => result.current.send()); expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body)
})
