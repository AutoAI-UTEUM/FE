import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import type { AuthContextValue } from '../auth/authContext'
import { GUARDIAN_TEAM_CONTRACT, GUARDIAN_WORKFLOW_CONTRACT, GUARDIAN_POLICY_REVIEW, parseGuardianDetail } from './guardianContract'
import { PRIOR_CONSENT_CONTRACT, parsePriorConsentOptions } from './priorConsentContract'
import { PriorConsentReview } from './PriorConsentReview'
import { guardianDetail, guardianStatus } from '../../test/guardianFixtures'
import { ApiClientError } from '../../shared/api'

const options = { available: true, noticeVersion: guardianStatus.noticeVersion, noticeDigest: guardianStatus.noticeDigest, noticeUrl: 'https://notice.example.invalid', methods: ['IN_PERSON'], maxAge: 'PT720H', requiredScopes: ['SERVICE'], optionalAiScope: 'EXTERNAL_AI' }
const request = vi.fn()
const invalidate = vi.fn()
const pending = vi.fn()
beforeEach(() => {
  vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', GUARDIAN_TEAM_CONTRACT); vi.stubEnv('VITE_GUARDIAN_WORKFLOW_READINESS', GUARDIAN_WORKFLOW_CONTRACT); vi.stubEnv('VITE_GUARDIAN_POLICY_REVIEW_READINESS', GUARDIAN_POLICY_REVIEW); vi.stubEnv('VITE_GUARDIAN_PRIOR_CONSENT_READINESS', PRIOR_CONSENT_CONTRACT)
  request.mockReset().mockResolvedValue({ data: options }); invalidate.mockReset(); pending.mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })
function page(detail: typeof guardianDetail | null = null) {
  return render(<AuthContext.Provider value={{ apiRequest: request, user: { id: 999 } } as unknown as AuthContextValue}><PriorConsentReview detail={detail} disabled={false} onPendingChange={pending} onInvalidate={invalidate} /></AuthContext.Provider>)
}
async function load() { fireEvent.click(screen.getByText('사전 동의 옵션 확인')); await screen.findByLabelText('대상 계정 ID') }
function fill() {
  if (!(screen.getByLabelText('대상 계정 ID') as HTMLInputElement).disabled) fireEvent.change(screen.getByLabelText('대상 계정 ID'), { target: { value: '123' } })
  fireEvent.change(screen.getByLabelText('원본 확인 수단'), { target: { value: 'IN_PERSON' } })
  fireEvent.change(screen.getByLabelText('원본의 관계'), { target: { value: 'PARENT' } })
  fireEvent.change(screen.getByLabelText('보관 원본 참조'), { target: { value: 'synthetic-record-001' } })
  fireEvent.change(screen.getByLabelText('실제 대면 동의 확인일 (UTC ISO)'), { target: { value: '2026-01-01T00:00:00Z' } })
  fireEvent.change(screen.getByLabelText('원본 동의 유효기한 (UTC ISO)'), { target: { value: '2099-01-01T00:00:00Z' } })
  screen.getAllByRole('checkbox').forEach(box => fireEvent.click(box))
}
it('default OFF sends no requests and unavailable options collect no evidence', async () => {
  vi.stubEnv('VITE_GUARDIAN_PRIOR_CONSENT_READINESS', ''); const view = page(); expect(view.container).toBeEmptyDOMElement(); expect(request).not.toHaveBeenCalled(); view.unmount()
  vi.stubEnv('VITE_GUARDIAN_PRIOR_CONSENT_READINESS', PRIOR_CONSENT_CONTRACT); request.mockResolvedValue({ data: { ...options, available: false } }); page(); fireEvent.click(screen.getByText('사전 동의 옵션 확인')); await screen.findByText('사전 동의 처리를 사용할 수 없습니다.'); expect(screen.queryByRole('checkbox')).toBeNull()
})
it('requires individual checks, never uploads originals, and sends one exact no-case payload', async () => {
  page(); await load(); expect(screen.getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true); expect(screen.queryByLabelText(/파일/)).toBeNull(); fill()
  fireEvent.click(screen.getByText('사전 동의 승인 최종 확인')); request.mockResolvedValue({ data: guardianStatus }); const send = screen.getByText('확인 후 전송'); fireEvent.click(send); fireEvent.click(send)
  await act(async () => {})
  expect(request).toHaveBeenCalledTimes(2); const [path, init] = request.mock.calls[1]; expect(path).toBe('/api/admin/guardian-requests/users/123/prior-consent/approval'); expect(init).toMatchObject({ method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer' }); expect(JSON.parse(init.body)).toMatchObject({ requestId: null, generation: 0, revision: 0, method: 'IN_PERSON', scopes: ['SERVICE', 'EXTERNAL_AI'], notWithdrawn: true }); expect(invalidate).toHaveBeenCalled()
})
it('409 discards the prepared operation and requires re-query, never retries a fresh revision', async () => {
  page(); await load(); fill(); fireEvent.click(screen.getByText('사전 동의 승인 최종 확인')); request.mockRejectedValue(new ApiClientError({ status: 409, code: 'GUARDIAN_STATE_CONFLICT', message: 'synthetic' })); fireEvent.click(screen.getByText('확인 후 전송')); await act(async () => {}); expect(screen.queryByText('같은 요청 다시 확인')).toBeNull(); expect(invalidate).toHaveBeenCalledWith(expect.stringContaining('다시 조회'))
})
it('lost response preserves the exact serialized key and body for an explicit retry', async () => {
  page(); await load(); fill(); fireEvent.click(screen.getByText('사전 동의 승인 최종 확인')); request.mockRejectedValueOnce(new Error('lost')); fireEvent.click(screen.getByText('확인 후 전송')); fireEvent.click(await screen.findByText('같은 요청 다시 확인')); await act(async () => {}); expect(request.mock.calls[1][1].body).toBe(request.mock.calls[2][1].body)
})
it('existing first pending case sends its immutable snapshot; later generations and changed declarations cannot approve', async () => {
  const d = { ...guardianDetail, userId: 123, generationStartedAt: '2026-02-01T00:00:00Z', status: { ...guardianStatus, generation: 1, requestExpiresAt: '2099-01-01T00:00:00Z', webDeclaredAt: null } }; page(d); await load(); fill(); fireEvent.click(screen.getByText('사전 동의 승인 최종 확인')); request.mockResolvedValue({ data: guardianStatus }); fireEvent.click(screen.getByText('확인 후 전송')); await act(async () => {}); expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ requestId: d.status.requestId, generation: 1, revision: d.status.revision })
  cleanup(); request.mockResolvedValue({ data: options }); page({ ...d, status: { ...d.status, generation: 2 } }); await load(); fill(); expect(screen.getByText('사전 동의 승인 최종 확인')).toBeDisabled()
})
it('pagehide clears evidence and aborts the pending options read', async () => {
  request.mockImplementation(() => new Promise(() => {})); page(); fireEvent.click(screen.getByText('사전 동의 옵션 확인')); act(() => window.dispatchEvent(new Event('pagehide'))); expect(request.mock.calls[0][1].signal.aborted).toBe(true); expect(screen.queryByLabelText('보관 원본 참조')).toBeNull()
})
it('rejects malformed ready options and preserves provenance without relabeling IN_PERSON', () => {
  expect(() => parsePriorConsentOptions({ ...options, requiredScopes: [] })).toThrow(); expect(() => parsePriorConsentOptions({ ...options, methods: ['EMAIL'] })).toThrow()
  const evidence = { method: 'IN_PERSON', receivedAt: '2026-01-01T00:00:00Z', reviewedAt: '2026-01-02T00:00:00Z', consentValidUntil: '2026-02-01T00:00:00Z' }
  expect(parseGuardianDetail({ ...guardianDetail, confirmationMethod: 'PRIOR_RECORD', priorConsentEvidence: evidence })).toMatchObject({ confirmationMethod: 'PRIOR_RECORD', priorConsentEvidence: evidence })
})
