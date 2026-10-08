import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../features/auth'
import { LAUNCH_AUTH_CONTRACT } from '../../features/auth/launchAuthContract'
import fixtures from '../../test/launchAuthFixtures.json'
import { SignupPage } from './SignupPage'
import { ApiClientError } from '../../shared/api'
import { isPolicyConsentRequired, isSignupPolicyNotReady, SIGNUP_POLICY_NOT_READY_MESSAGE } from '../../features/auth/signupPolicyError'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const success = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: 'synthetic' }))
const failure = (data: { body: unknown; status: number }) => new Response(JSON.stringify(data.body), { status: data.status })
function GoogleStart() {
  const { prepareGoogleSignup } = useAuth()
  return <button onClick={() => prepareGoogleSignup(fixtures.inputs.existingGoogleLogin.idToken)}>합성 Google 시작</button>
}
function AuthProbe() { const { isAuthenticated } = useAuth(); return <p data-testid="auth-state">{String(isAuthenticated)}</p> }
function renderPage(google = true) {
  render(<AuthProvider initialUser={null}><MemoryRouter initialEntries={['/signup']}><AuthProbe /><GoogleStart /><Routes>
    <Route path="/signup" element={<SignupPage />} /><Route path="/verify-email" element={<p>확인 안내 화면</p>} />
    <Route path="/login" element={<p>로그인 안내 화면</p>} />
  </Routes></MemoryRouter></AuthProvider>)
  if (google) fireEvent.click(screen.getByRole('button', { name: '합성 Google 시작' }))
}

it('new Google continuation refreshes policy version and requires fresh consent before retrying', async () => {
  let version = 'synthetic-1'
  const bodies: Record<string, unknown>[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/policies/current')) return success([
      { type: 'TERMS', version, title: '합성 이용약관', requiresConsent: true },
      { type: 'PRIVACY', version, title: '열람 문서', requiresConsent: false },
    ])
    if (String(url).includes('/policies/TERMS/')) return success({ content: '합성 전문' })
    bodies.push(JSON.parse(init!.body as string))
    if (bodies.length === 1) { version = 'synthetic-2'; return failure(fixtures.responses.policyRequired) }
    return failure(fixtures.responses.googleEmailConflict)
  })
  renderPage()
  fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: '2000-02-29' } })
  fireEvent.click(await screen.findByLabelText('합성 이용약관 동의 (필수)'))
  fireEvent.click(screen.getByRole('button', { name: '합성 이용약관 전문 보기' }))
  expect(await screen.findByText('합성 전문')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
  expect(await screen.findByText('정책이 변경되었습니다. 최신 정책을 확인하고 다시 동의해 주세요.')).toBeInTheDocument()
  await waitFor(() => expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/policies/current'))).toHaveLength(2))
  expect(screen.getByLabelText('합성 이용약관 동의 (필수)')).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
  expect(bodies).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('합성 이용약관 동의 (필수)'))
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
  await waitFor(() => expect(bodies).toHaveLength(2))
  expect(bodies[0]).toMatchObject({ idToken: fixtures.inputs.existingGoogleLogin.idToken, dateOfBirth: '2000-02-29', consents: [{ type: 'TERMS', version: 'synthetic-1' }] })
  expect(bodies[1]).toMatchObject({ consents: [{ type: 'TERMS', version: 'synthetic-2' }] })
  expect(await screen.findByText('Google 회원가입을 계속할 수 없습니다')).toBeInTheDocument()
})

it('an empty document list permits submission for BE required=false; DOB creates no approval and BE still decides readiness', async () => {
  const bodies: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/policies/current')) return success([])
    bodies.push(JSON.parse(init!.body as string))
    return failure({ status: 401, body: { success: false, error: { code: 'TOKEN_INVALID', message: 'synthetic', details: [] } } })
  })
  renderPage()
  await screen.findByLabelText('생년월일')
  await waitFor(() => expect(screen.queryByText('현재 정책 다시 조회')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
  expect(bodies).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: '2015-01-02' } })
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
  fireEvent.click(screen.getByRole('button', { name: '가입 중' }))
  await waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0]).toMatchObject({ dateOfBirth: '2015-01-02', consents: [] })
  expect(Object.keys(bodies[0]).some((field) => /age|guardian|adult|aiConsent/i.test(field))).toBe(false)
  expect(await screen.findByText('Google 회원가입을 계속할 수 없습니다')).toBeInTheDocument()
})

const policyUnavailable = { status: 503, body: { success: false, error: { code: 'SIGNUP_POLICY_NOT_READY', message: 'synthetic', details: [] } } }
async function fillLocal() {
  fireEvent.click(screen.getByRole('button', { name: '다음' }))
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '합성 계정' } })
  fireEvent.change(screen.getByLabelText('소속'), { target: { value: '합성 학교' } })
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'synthetic@example.invalid' } })
  fireEvent.change(screen.getByLabelText('비밀번호', { exact: true }), { target: { value: 'Synthetic123!' } })
  fireEvent.change(screen.getByLabelText('비밀번호 확인', { exact: true }), { target: { value: 'Synthetic123!' } })
  fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: '2000-02-29' } })
  await waitFor(() => expect(screen.queryByText('현재 정책 다시 조회')).not.toBeInTheDocument())
}
it.each(['LOCAL', 'Google'])('%s 503 stops signup and allows one explicit policy lookup, with no automatic resubmission', async (kind) => {
  let policyCalls = 0
  const bodies: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/policies/current')) { policyCalls++; return success([]) }
    if (String(url).includes('/email-availability')) return success({ available: true })
    bodies.push(JSON.parse(init!.body as string))
    return failure(policyUnavailable)
  })
  renderPage(kind === 'Google')
  if (kind === 'LOCAL') await fillLocal()
  else {
    fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: '2000-02-29' } })
    await waitFor(() => expect(screen.queryByText('현재 정책 다시 조회')).not.toBeInTheDocument())
  }
  const submit = () => screen.getByRole('button', { name: kind === 'Google' ? '가입하기' : '가입 완료' })
  const firstSubmit = submit()
  fireEvent.click(firstSubmit); fireEvent.click(firstSubmit)
  expect(await screen.findByText(SIGNUP_POLICY_NOT_READY_MESSAGE)).toBeInTheDocument()
  expect(bodies).toHaveLength(1)
  expect(policyCalls).toBe(1)
  expect(submit()).toBeDisabled()
  const policyRetry = screen.getByRole('button', { name: '현재 정책 한 번 다시 확인' })
  fireEvent.click(policyRetry); fireEvent.click(policyRetry)
  await waitFor(() => expect(submit()).not.toBeDisabled())
  expect(policyCalls).toBe(2)
  expect(bodies).toHaveLength(1)
  fireEvent.click(submit())
  expect(await screen.findByText('이번 화면의 재확인을 사용했습니다. 나중에 다시 방문해 주세요.')).toBeInTheDocument()
  expect(bodies).toHaveLength(2)
  expect(submit()).toBeDisabled()
  expect(screen.getByTestId('auth-state')).toHaveTextContent('false')
  expect(screen.queryByText(/정책이 변경되었습니다/)).not.toBeInTheDocument()
})
it('HTTP status and code together distinguish policy readiness from required consent', () => {
  for (const [status, code, readiness, consent] of [[503, 'SIGNUP_POLICY_NOT_READY', true, false], [400, 'POLICY_CONSENT_REQUIRED', false, true], [400, 'SIGNUP_POLICY_NOT_READY', false, false], [503, 'POLICY_CONSENT_REQUIRED', false, false]] as const) {
    const error = new ApiClientError({ status, code, message: 'synthetic' })
    expect(isSignupPolicyNotReady(error)).toBe(readiness)
    expect(isPolicyConsentRequired(error)).toBe(consent)
  }
})
it('LOCAL 400 refreshes current documents and clears consent rather than showing preparation failure', async () => {
  let version = 'synthetic-1'
  let signupCalls = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/policies/current')) return success([{ type: 'TERMS', version, title: '합성 정책', requiresConsent: true }])
    if (String(url).includes('/email-availability')) return success({ available: true })
    signupCalls++; version = 'synthetic-2'; return failure(fixtures.responses.policyRequired)
  })
  renderPage(false); await fillLocal()
  fireEvent.click(await screen.findByLabelText('합성 정책 동의 (필수)'))
  fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))
  expect(await screen.findByText('정책이 변경되었습니다. 최신 정책을 확인하고 다시 동의해 주세요.')).toBeInTheDocument()
  expect(screen.getByLabelText('합성 정책 동의 (필수)')).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))
  expect(signupCalls).toBe(1)
  expect(screen.queryByText(SIGNUP_POLICY_NOT_READY_MESSAGE)).not.toBeInTheDocument()
})
it.each(['cancel', 'pagehide', 'unmount'])('Google %s ignores late success, aborts and creates no client session', async (kind) => {
  let release!: (response: Response) => void
  let signal: AbortSignal | null | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
    if (String(url).endsWith('/policies/current')) return Promise.resolve(success([]))
    signal = init?.signal
    return new Promise((resolve) => { release = resolve })
  })
  renderPage()
  fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: '2000-02-29' } })
  await waitFor(() => expect(screen.queryByText('현재 정책 다시 조회')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '가입하기' }))
  await waitFor(() => expect(signal).toBeTruthy())
  if (kind === 'cancel') fireEvent.click(screen.getByRole('button', { name: '취소' }))
  else if (kind === 'pagehide') window.dispatchEvent(new Event('pagehide'))
  else cleanup()
  expect(signal!.aborted).toBe(true)
  await act(async () => { release(failure(fixtures.responses.newGoogleSignup)) })
  if (kind !== 'unmount') expect(screen.getByTestId('auth-state')).toHaveTextContent('false')
  expect(screen.queryByText('확인 안내 화면')).not.toBeInTheDocument()
})

