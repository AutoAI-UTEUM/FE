import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, RequireAuth } from '../../features/auth'
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

type LoginEntry = string | {
  hash?: string
  pathname: string
  search?: string
  state?: unknown
}

function renderLogin(path: LoginEntry = '/login') {
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
          <Route path="/sessions/:sessionId" element={<LocationView />} />
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

  it('places Google login after local login and shows the account links', async () => {
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
    expect(screen.queryByText('계정이 없으신가요?')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '비밀번호 찾기' })).toBeInTheDocument()
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
    expect(screen.queryByText(/만 14세 이상/)).not.toBeInTheDocument()
    expect(screen.queryByText(/이용약관/)).not.toBeInTheDocument()
    expect(screen.queryByText(/개인정보 처리방침/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    const googleCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([input]) => String(input).endsWith('/api/auth/google'))
    expect(JSON.parse(String(googleCalls[1]?.[1]?.body))).toEqual({
      idToken: 'new-google-id-token',
      role: 'INSTRUCTOR',
    })
  })

  it('stops Google signup when the email already belongs to an existing account', async () => {
    googleCredential = 'conflicting-google-id-token'
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/auth/google')) {
        return apiFailure('EMAIL_ALREADY_EXISTS', 409)
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderLogin()

    fireEvent.click(await screen.findByRole('button', { name: 'Google 계정으로 계속' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '같은 이메일을 사용하는 계정이 있어 Google로 자동 연결할 수 없습니다.',
    )
    expect(screen.queryByRole('heading', { name: 'Google 가입을 완료해 주세요' })).not.toBeInTheDocument()
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/auth/google'))).toHaveLength(1)
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).endsWith('/api/auth/refresh'))).toBe(false)
  })

  it('keeps an invalid Google credential out of signup and refresh flows', async () => {
    googleCredential = 'invalid-google-id-token'
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/auth/google')) {
        return apiFailure('TOKEN_INVALID', 401)
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderLogin()

    fireEvent.click(await screen.findByRole('button', { name: 'Google 계정으로 계속' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Google 인증을 확인하지 못했습니다.')
    expect(screen.queryByRole('heading', { name: 'Google 가입을 완료해 주세요' })).not.toBeInTheDocument()
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).endsWith('/api/auth/refresh'))).toBe(false)
  })

  it('clears temporary Google signup state when the final signup detects an email conflict', async () => {
    googleCredential = 'new-google-id-token'
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    let googleCalls = 0
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/auth/google')) {
        googleCalls += 1
        return googleCalls === 1
          ? apiFailure('SIGNUP_REQUIRED', 409)
          : apiFailure('EMAIL_ALREADY_EXISTS', 409)
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderLogin()

    fireEvent.click(await screen.findByRole('button', { name: 'Google 계정으로 계속' }))
    expect(await screen.findByRole('heading', { name: 'Google 가입을 완료해 주세요' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('heading', { name: 'Google 회원가입을 계속할 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('기존 로그인 방식을 이용하거나 지원에 문의해 주세요.')
    fireEvent.click(screen.getByRole('button', { name: '기존 로그인 방식 선택' }))
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(googleCalls).toBe(2)
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

  it('returns a local login to a validated path with query and hash intact', async () => {
    renderLogin({
      pathname: '/login',
      state: {
        authReturnTo: {
          hash: '#message-7',
          pathname: '/sessions/100',
          search: '?tab=chat&sort=recent',
        },
      },
    })

    submitLocalLogin()

    expect(await screen.findByTestId('current-location')).toHaveTextContent(
      '/sessions/100?tab=chat&sort=recent#message-7',
    )
  })

  it('returns an existing Google member to the validated protected path', async () => {
    renderLogin({
      pathname: '/login',
      state: {
        authReturnTo: {
          hash: '#notes',
          pathname: '/sessions/100',
          search: '?tab=summary',
        },
      },
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Google 계정으로 계속' }),
    )

    expect(await screen.findByTestId('current-location')).toHaveTextContent(
      '/sessions/100?tab=summary#notes',
    )
  })

  it('keeps the expired-session notice and returns after reauthentication', async () => {
    renderLogin({
      pathname: '/login',
      search: '?reason=session-expired',
      state: {
        authReturnTo: {
          hash: '',
          pathname: '/sessions/100',
          search: '?tab=chat',
        },
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      '세션이 만료되었습니다. 다시 로그인하세요.',
    )
    submitLocalLogin()

    expect(await screen.findByTestId('current-location')).toHaveTextContent(
      '/sessions/100?tab=chat',
    )
  })

  it('falls back safely when forged history state contains an external target', async () => {
    renderLogin({
      pathname: '/login',
      state: {
        authReturnTo: {
          hash: '',
          pathname: '//evil.example/phish',
          search: '',
        },
      },
    })

    submitLocalLogin()

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    expect(window.location.origin).not.toBe('https://evil.example')
  })

  it('ignores an external return target supplied in the login URL', async () => {
    renderLogin('/login?returnTo=https%3A%2F%2Fevil.example%2Fphish')

    submitLocalLogin()

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    expect(window.location.origin).not.toBe('https://evil.example')
  })

  it('preserves the return state across Back and Forward before login', async () => {
    renderProtectedHistory()

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByTestId('return-path')).toHaveTextContent('/sessions/100')

    fireEvent.click(screen.getByRole('button', { name: '뒤로' }))
    expect(screen.getByTestId('return-path')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: '앞으로' }))
    expect(screen.getByTestId('return-path')).toHaveTextContent('/sessions/100')

    submitLocalLogin()
    expect(await screen.findByTestId('current-location')).toHaveTextContent(
      '/sessions/100?tab=chat#message-7',
    )
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
      '장시간 활동이 없어 로그아웃되었습니다.',
    )
  })

  it('opens the forgot password page', () => {
    renderLogin()

    fireEvent.click(screen.getByRole('link', { name: '비밀번호 찾기' }))

    expect(screen.getByText('비밀번호 찾기 화면')).toBeInTheDocument()
  })
})

function submitLocalLogin() {
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: 'learner@example.com' },
  })
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password-123' },
  })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
}

function LocationView() {
  const location = useLocation()
  return (
    <p data-testid="current-location">
      {location.pathname}{location.search}{location.hash}
    </p>
  )
}

function HistoryControls() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as {
    authReturnTo?: { pathname?: string }
  } | null

  return (
    <>
      <button onClick={() => navigate(-1)} type="button">뒤로</button>
      <button onClick={() => navigate(1)} type="button">앞으로</button>
      <output data-testid="return-path">
        {state?.authReturnTo?.pathname ?? 'none'}
      </output>
    </>
  )
}

function renderProtectedHistory() {
  return render(
    <AuthProvider initialUser={null}>
      <MemoryRouter
        initialEntries={[
          '/login',
          '/sessions/100?tab=chat#message-7',
        ]}
        initialIndex={1}
      >
        <HistoryControls />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/sessions/:sessionId" element={<LocationView />} />
          </Route>
          <Route path="/classrooms" element={<p>내 강의실 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

function apiFailure(code: string, status: number): Response {
  return new Response(JSON.stringify({
    error: { code, details: [], message: '요청을 처리할 수 없습니다.' },
    success: false,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}
