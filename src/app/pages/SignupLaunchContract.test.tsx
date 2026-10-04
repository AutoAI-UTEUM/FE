import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../features/auth'
import { LAUNCH_AUTH_CONTRACT } from '../../features/auth/launchAuthContract'
import fixtures from '../../test/launchAuthFixtures.json'
import { SignupPage } from './SignupPage'

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
function renderPage() {
  render(<AuthProvider initialUser={null}><MemoryRouter initialEntries={['/signup']}><GoogleStart /><Routes>
    <Route path="/signup" element={<SignupPage />} /><Route path="/verify-email" element={<p>확인 안내 화면</p>} />
  </Routes></MemoryRouter></AuthProvider>)
  fireEvent.click(screen.getByRole('button', { name: '합성 Google 시작' }))
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

it('zero required documents sends an explicit empty selection; DOB alone creates no age approval', async () => {
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

