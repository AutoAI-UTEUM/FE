import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../features/auth'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { LoginPage } from './LoginPage'
import { SignupPage } from './SignupPage'

let googleCredential = 'existing-google-id-token'
let googleCredentialCallback: (response: { credential?: string }) => void

beforeEach(() => {
  installApiFixtureServer()
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client-id')
  googleCredential = 'existing-google-id-token'
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn(({ callback }) => {
          googleCredentialCallback = callback
        }),
        renderButton: vi.fn((container) => {
          const button = document.createElement('button')
          button.textContent = 'Google 계정으로 계속'
          button.addEventListener('click', () => {
            googleCredentialCallback({ credential: googleCredential })
          })
          container.append(button)
        }),
      },
    },
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  delete window.google
  document.getElementById('google-identity-services')?.remove()
  window.localStorage.clear()
})

function renderLogin(path = '/login') {
  return render(
    <AuthProvider initialUser={null}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/forgot-password"
            element={<p>비밀번호 찾기 화면</p>}
          />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/classrooms" element={<p>내 강의실 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('LoginPage', () => {
  it('toggles the local login password visibility', () => {
    renderLogin()

    expect(screen.queryByText('다시 오신 걸 환영해요')).not.toBeInTheDocument()
    const passwordInput = screen.getByLabelText('비밀번호')
    expect(passwordInput).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 표시' }))
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 숨기기' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('places Google login after local login and shows the signup prompt', async () => {
    renderLogin()

    const localLogin = screen.getByRole('button', { name: '로그인' })
    const googleLogin = await screen.findByRole('button', {
      name: 'Google 계정으로 계속',
    })

    expect(googleLogin.closest('.google-signin-button')).toHaveClass(
      'h-11',
      'w-full',
      'min-w-full',
      'max-w-full',
      'rounded-lg',
    )
    expect(window.google?.accounts.id.renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        shape: 'rectangular',
        size: 'large',
        width: 440,
      }),
    )

    expect(
      localLogin.compareDocumentPosition(googleLogin) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('계정이 없으신가요?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '회원가입' })).toBeInTheDocument()
    expect(screen.queryByText('또는')).not.toBeInTheDocument()
  })

  it('logs in an existing member with a GIS credential', async () => {
    renderLogin()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Google 계정으로 계속' }),
    )

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    const googleCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([input]) => String(input).endsWith('/api/auth/google'))
    expect(JSON.parse(String(googleCall?.[1]?.body))).toEqual({
      idToken: 'existing-google-id-token',
    })
  })

  it('moves SIGNUP_REQUIRED users to the signup page', async () => {
    googleCredential = 'new-google-id-token'
    renderLogin()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Google 계정으로 계속' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Google 가입을 완료해 주세요',
      }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '강의자' }))
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /이용약관 및 개인정보 처리방침에 동의합니다/,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '동의하고 가입하기' }))

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    const googleCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([input]) => String(input).endsWith('/api/auth/google'))
    expect(JSON.parse(String(googleCalls[1]?.[1]?.body))).toEqual({
      idToken: 'new-google-id-token',
      privacyVersion: '2026-07-01',
      role: 'INSTRUCTOR',
      termsVersion: '2026-07-01',
    })
  })

  it('validates empty fields before calling the API', () => {
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: /로그인/ }))

    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
  })

  it('logs in and redirects to classrooms on success', async () => {
    renderLogin()

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'learner@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /로그인/ }))

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
  })

  it('shows the mapped field error for invalid credentials', async () => {
    renderLogin()

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'locked@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /로그인/ }))

    expect(
      await screen.findByText('이메일 또는 비밀번호를 확인하세요.'),
    ).toBeInTheDocument()
  })

  it('shows the session expired banner from the query string', () => {
    renderLogin('/login?reason=session-expired')

    expect(screen.getByRole('alert')).toHaveTextContent(
      '세션이 만료되었습니다. 다시 로그인하세요.',
    )
  })

  it('shows the idle logout banner from the query string', () => {
    renderLogin('/login?reason=idle')

    expect(screen.getByRole('alert')).toHaveTextContent(
      '30분 동안 활동이 없어 로그아웃되었습니다.',
    )
  })

  it('opens the forgot password page', () => {
    renderLogin()

    fireEvent.click(screen.getByRole('link', { name: '비밀번호 찾기' }))

    expect(screen.getByText('비밀번호 찾기 화면')).toBeInTheDocument()
  })
})
