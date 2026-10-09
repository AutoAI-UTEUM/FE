import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../features/auth'
import { GUARDIAN_TEAM_CONTRACT, guardianStates } from '../../features/guardian/guardianContract'
import { guardianEntry, guardianPendingUser, guardianStatus, guardianView } from '../../test/guardianFixtures'
import { GuardianRequestPage, GuardianRequestStatus } from './GuardianRequestPage'

const success = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: 'synthetic' }))
beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', '/api'); vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', GUARDIAN_TEAM_CONTRACT); vi.stubGlobal('BroadcastChannel', undefined) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function ChangeAccount() { const { updateUser } = useAuth(); return <button onClick={() => updateUser({ ...guardianPendingUser, id: 900002, email: 'second@example.invalid' })}>합성 계정 전환</button> }
function page() { return render(<AuthProvider initialUser={guardianPendingUser}><MemoryRouter><ChangeAccount /><GuardianRequestPage /></MemoryRouter></AuthProvider>) }
it('OFF mounts with no guardian networking, collection or mutation controls', () => {
  vi.stubEnv('VITE_GUARDIAN_TEAM_READINESS', '')
  const fetch = vi.spyOn(globalThis, 'fetch')
  const { container } = page()
  expect(screen.getByText('보호자 팀 확인 절차를 준비하고 있습니다.')).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
  expect(container.querySelector('input')).toBeNull()
  expect(screen.queryByRole('button', { name: '현재 신청 상태 다시 확인' })).not.toBeInTheDocument()
})
it('REQUIRED with APPROVED keeps separate service/AI facts and does not invent global authorization', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ ...guardianEntry, request: { ...guardianView, status: { ...guardianStatus, state: 'APPROVED', serviceApproved: true, externalAiApproved: false } } }))
  page()
  const section = await screen.findByRole('region', { name: '현재 보호자 신청' })
  expect(within(section).getByText('승인됨', { exact: true })).toBeInTheDocument()
  expect(within(section).getByText('유효한 승인 없음', { exact: true })).toBeInTheDocument()
  expect(screen.getByText(/서버 판정상 보호자 절차 대상/)).toBeInTheDocument()
})
it.each(['', ' \t\n'])('renders a valid Entry with absent optional AI scope %j', async (optionalAiScope) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ ...guardianEntry, request: { ...guardianView, optionalAiScope } }))
  page()
  expect(await screen.findByRole('region', { name: '현재 보호자 신청' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getAllByText('유효한 승인 없음')).toHaveLength(2)
})
it.each(guardianStates)('renders %s without deriving approval from state or HTML/forms', (state) => {
  const { container } = render(<GuardianRequestStatus view={{ ...guardianView, status: { ...guardianStatus, state } }} />)
  expect(screen.getAllByText('유효한 승인 없음')).toHaveLength(2)
  expect(screen.getByText(guardianView.forms.reply_form)).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('웹 의사 표시 시각')).toBeInTheDocument()
  expect(screen.getByText(`${guardianStatus.webDeclaredAt} (UTC)`)).toBeInTheDocument()
  expect(screen.getAllByText('기록 없음').length).toBeGreaterThan(0)
})
it('stale notice suppresses forms and uses no Entry channel fallback', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ ...guardianEntry, request: { ...guardianView, status: { ...guardianStatus, currentNotice: false }, noticeUrl: null, replyChannel: null, forms: {} } }))
  page()
  expect(await screen.findByText(/안내 설정이 변경되었습니다/)).toBeInTheDocument()
  expect(screen.queryByText(/회신 방법:/)).not.toBeInTheDocument()
  expect(screen.queryByText(guardianView.forms.reply_form)).not.toBeInTheDocument()
})
it.each(['NOT_REQUIRED', 'BIRTHDATE_REQUIRED', 'REQUIRED'] as const)('unavailable %s/null never concludes past request absence', async (requirement) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({ requirement, teamReviewAvailable: false, canStartRequest: false, replyChannel: null, request: null }))
  page()
  expect(await screen.findByText(/과거 신청 부재를 의미하지 않습니다/)).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument()
})
it('double clicks issue one read; pagehide and unmount discard late state', async () => {
  let release!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { release = resolve }))
  const rendered = page()
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '현재 신청 상태 다시 확인' }))
  fireEvent.click(screen.getByRole('button', { name: '현재 신청 상태 다시 확인' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  const signal = fetch.mock.calls[0][1]!.signal!
  act(() => window.dispatchEvent(new Event('pagehide')))
  expect(signal.aborted).toBe(true)
  await act(async () => { release(success(guardianEntry)) })
  expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument()
  rendered.unmount()
})
it('account switch aborts old read, clears snapshot and ignores its late result', async () => {
  let release!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    .mockResolvedValue(success({ ...guardianEntry, requirement: 'NOT_REQUIRED', request: null }))
  page()
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '합성 계정 전환' }))
  expect(await screen.findByText(/신청 대상이 아닙니다/)).toBeInTheDocument()
  await act(async () => { release(success(guardianEntry)) })
  expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument()
})
it.each([['GUARDIAN_TEAM_UNAVAILABLE', 503], ['ACCESS_DENIED', 403], ['RATE_LIMIT_EXCEEDED', 429], ['GUARDIAN_STATE_CONFLICT', 409], ['GUARDIAN_TEAM_REQUEST_NOT_FOUND', 404]])('%s clears old state, has no automatic retry', async (code, status) => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(success(guardianEntry)).mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code, message: 'synthetic', details: [] } }), { status: status as number }))
  page()
  await screen.findByRole('region', { name: '현재 보호자 신청' })
  fireEvent.click(screen.getByRole('button', { name: '현재 신청 상태 다시 확인' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '현재 보호자 신청' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})
