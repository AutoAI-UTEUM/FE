import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, RequireAuth } from '../../features/auth'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { PolicyConsentPage, ResetPasswordPage } from './AuthCapabilityPages'
import { LoginPage } from './LoginPage'

beforeEach(() => {
  vi.stubEnv('VITE_API_CAPABILITIES', 'password-reset')
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderResetPassword(entry = '/reset-password?token=valid-token') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<ResetPasswordPage />} path="/reset-password" />
        <Route element={<p>로그인 화면</p>} path="/login" />
        <Route element={<p>비밀번호 찾기 화면</p>} path="/forgot-password" />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('requires a reset token', () => {
    renderResetPassword('/reset-password')

    expect(screen.getByRole('heading', { name: '비밀번호를 재설정할 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '재설정 링크 다시 받기' })).toHaveAttribute('href', '/forgot-password')
  })

  it('validates password policy and matching confirmation', () => {
    renderResetPassword()

    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(screen.getByRole('alert')).toHaveTextContent('8~64자, 영문·숫자를 포함해야 합니다.')
  })

  it('confirms the reset and links to login', async () => {
    renderResetPassword()

    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'new-password-1' } })
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'new-password-1' } })
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByRole('heading', { name: '비밀번호 변경 완료' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '새 비밀번호로 로그인' })).toHaveAttribute('href', '/login')
  })

  it('shows one message for an expired or invalid token', async () => {
    renderResetPassword('/reset-password?token=expired-token')

    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'new-password-1' } })
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'new-password-1' } })
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('재설정 링크가 만료되었거나 유효하지 않습니다. 링크를 다시 요청해 주세요.')
  })
})

describe('정책 동의 게이팅', () => {
  function mockServer({ pending }: { pending: Array<{ type: string; version: string }> }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = (input instanceof Request ? input.method : init?.method) ?? 'GET'
      if (url.pathname === '/api/auth/login') {
        return json({
          accessToken: 'access-token',
          expiresIn: 3600,
          pendingConsents: pending,
          tokenType: 'Bearer',
          user: { email: 'learner@example.com', id: 1, name: '학습자', role: 'LEARNER' },
        })
      }
      if (url.pathname === '/api/users/me/consents') {
        // POST 이후에는 미동의가 없어야 한다.
        return json(method === 'POST' ? { agreed: [], pending: [] } : { agreed: [], pending } )
      }
      if (url.pathname.startsWith('/api/policies/')) {
        return json({ content: '제1조 ...', title: '이용약관', type: 'TERMS', version: '0.9' })
      }
      return new Response(null, { status: 404 })
    })
  }

  function renderApp() {
    return render(
      <AuthProvider initialUser={null}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route element={<LoginPage />} path="/login" />
            <Route element={<RequireAuth />}>
              <Route element={<PolicyConsentPage />} path="/consents" />
              <Route element={<p>내 강의실 화면</p>} path="/classrooms" />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )
  }

  async function signIn() {
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'learner@example.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
  }

  it('미동의 정책이 있으면 앱 대신 동의 화면으로 보낸다', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'policy-consent')
    mockServer({ pending: [{ type: 'TERMS', version: '0.9' }, { type: 'PRIVACY', version: '0.9' }] })
    renderApp()
    await signIn()

    expect(await screen.findByRole('heading', { name: '약관 동의' })).toBeInTheDocument()
    expect(screen.queryByText('내 강의실 화면')).not.toBeInTheDocument()

    // 하나만 체크한 상태로는 넘어갈 수 없다.
    const checkboxes = await screen.findAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    fireEvent.click(checkboxes[0])
    expect(screen.getByRole('button', { name: '동의하고 계속' })).toBeDisabled()

    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByRole('button', { name: '동의하고 계속' }))
    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
  })

  it('전문은 펼칠 때만 받아온다', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'policy-consent')
    const fetchMock = mockServer({ pending: [{ type: 'TERMS', version: '0.9' }] })
    renderApp()
    await signIn()
    const summary = await screen.findByText('전문 보기')

    const policyCalls = () => fetchMock.mock.calls.filter(([input]) => String(input instanceof Request ? input.url : input).includes('/api/policies/')).length
    expect(policyCalls()).toBe(0)

    // jsdom은 summary 클릭으로 toggle을 내지 않아서 open을 직접 세운다.
    const details = summary.closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(await screen.findByText('제1조 ...')).toBeInTheDocument()
    expect(policyCalls()).toBe(1)
  })

  it('capability가 꺼져 있으면 게이팅하지 않는다', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', '')
    mockServer({ pending: [{ type: 'TERMS', version: '0.9' }] })
    renderApp()
    await signIn()

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: '약관 동의' })).not.toBeInTheDocument())
  })
})

function json(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '정상', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
