import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, useAuth } from '../../features/auth'
import {
  apiFailure,
  apiSuccess,
  installApiFixtureServer,
} from '../../test/apiFixtureServer'
import { SignupPage } from './SignupPage'

let apiOverride:
  | ((
      request: Request,
    ) => Response | Promise<Response | undefined> | undefined)
  | undefined

beforeEach(() => {
  apiOverride = undefined
  installApiFixtureServer((request) => apiOverride?.(request))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.clear()
})

function renderSignup() {
  return render(
    <AuthProvider initialUser={null}>
      <AuthStateProbe />
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/classrooms" element={<ClassroomsProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

function AuthStateProbe() {
  const { login, user } = useAuth()
  return (
    <div>
      <button
        onClick={() => {
          void login({
            email: 'second@example.com',
            password: 'second-password-123',
          })
        }}
        type="button"
      >
        다른 계정 로그인
      </button>
      <p data-testid="active-auth-email">{user?.email}</p>
    </div>
  )
}

function ClassroomsProbe() {
  const { user } = useAuth()
  return (
    <div>
      <p>내 강의실 화면</p>
      <p data-testid="signed-in-email">{user?.email}</p>
    </div>
  )
}

function completeAccountForm(email: string) {
  fireEvent.click(screen.getByRole('button', { name: '다음' }))
  fireEvent.change(screen.getByLabelText('이름'), {
    target: { value: '학습자' },
  })
  fireEvent.change(screen.getByLabelText('소속'), {
    target: { value: '으뜸학교' },
  })
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password-123' },
  })
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
    target: { value: 'password-123' },
  })
}

describe('SignupPage', () => {
  it('selects a role before showing the account form', () => {
    renderSignup()

    expect(
      screen.getByRole('heading', { name: '어떤 역할로 사용하시나요?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^학습자/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByText('강의실에 참여해 AI와 학습해요')).toBeInTheDocument()
    expect(screen.getByText('강의실을 만들고 학습자를 관리해요')).toBeInTheDocument()
    expect(screen.queryByText('가입 후에도 설정에서 변경할 수 있어요')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /^강의자/ }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(
      screen.getByRole('heading', { name: '계정 정보를 입력하세요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/회원가입 2 \/ 2/)).toHaveTextContent('강의자')

    fireEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByRole('radio', { name: /^강의자/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('validates required fields before calling the API', () => {
    renderSignup()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(screen.getByText('이름을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('소속을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('비밀번호를 입력하세요.')).toBeInTheDocument()
    expect(
      screen.getByText('비밀번호를 한 번 더 입력하세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/만 14세 이상/)).not.toBeInTheDocument()
    expect(screen.queryByText(/이용약관/)).not.toBeInTheDocument()
    expect(screen.queryByText(/개인정보 처리방침/)).not.toBeInTheDocument()
  })

  it('shows password strength with the required affiliation field', () => {
    renderSignup()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password-123' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
      target: { value: 'password-123' },
    })

    expect(screen.queryByText('약함')).not.toBeInTheDocument()
    expect(screen.queryByText('보통')).not.toBeInTheDocument()
    expect(screen.queryByText('안전')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '비밀번호 안전도' })).toHaveClass('w-full')
    expect(screen.getByRole('progressbar', { name: '비밀번호 안전도' })).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute(
      'type',
      'password',
    )
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 표시' }))
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('비밀번호 확인')).toHaveAttribute(
      'type',
      'password',
    )
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 확인 표시' }))
    expect(screen.getByLabelText('비밀번호 확인')).toHaveAttribute('type', 'text')

    expect(screen.getByLabelText('소속')).toBeRequired()
    expect(screen.queryByRole('checkbox', { name: /학습 소식 이메일 수신/ })).not.toBeInTheDocument()
  })

  it('signs up without rendering or sending consent fields', async () => {
    renderSignup()

    fireEvent.click(screen.getByRole('radio', { name: /^강의자/ }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '학습자' },
    })
    fireEvent.change(screen.getByLabelText('소속'), {
      target: { value: '울산대학교' },
    })
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password-123' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
      target: { value: 'password-123' },
    })
    expect(screen.queryByText(/만 14세 이상/)).not.toBeInTheDocument()
    expect(screen.queryByText(/이용약관/)).not.toBeInTheDocument()
    expect(screen.queryByText(/개인정보 처리방침/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()

    const signupCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([input]) =>
        String(input).endsWith('/api/auth/signup'),
      )
    const signupBody = JSON.parse(String(signupCall?.[1]?.body))
    expect(signupBody).toMatchObject({
      email: 'new@example.com',
      affiliation: '울산대학교',
      learningEmailOptIn: false,
      role: 'INSTRUCTOR',
    })
    expect(signupBody).not.toHaveProperty('confirmPassword')
    expect(signupBody).not.toHaveProperty('consents')
  })

  it('distinguishes a completed signup when only automatic login fails', async () => {
    apiOverride = (request) => {
      if (
        request.method === 'POST' &&
        new URL(request.url).pathname === '/api/auth/login'
      ) {
        return apiFailure(
          'AUTH_TEMPORARILY_UNAVAILABLE',
          '로그인 요청을 처리하지 못했습니다.',
          503,
        )
      }
    }
    renderSignup()

    completeAccountForm('new@example.com')
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(
      await screen.findByRole('heading', { name: '회원가입이 완료되었습니다' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '계정은 생성되었지만 자동 로그인하지 못했습니다. 로그인 화면에서 다시 로그인해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '로그인하러 가기' }),
    ).toHaveAttribute('href', '/login')
    expect(
      screen.queryByText('회원가입 요청을 처리하지 못했습니다.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('password-123')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('new@example.com')
    expect(document.body).not.toHaveTextContent(/인증 메일|메일을 발송/)
  })

  it('keeps signup API failures separate and never attempts login', async () => {
    apiOverride = (request) => {
      if (
        request.method === 'POST' &&
        new URL(request.url).pathname === '/api/auth/signup'
      ) {
        return apiFailure(
          'SIGNUP_TEMPORARILY_UNAVAILABLE',
          '회원가입 요청을 처리하지 못했습니다.',
          503,
        )
      }
    }
    renderSignup()
    completeAccountForm('signup-failure@example.com')

    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(
      await screen.findByText('회원가입 요청을 처리하지 못했습니다.'),
    ).toBeInTheDocument()
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(([input]) =>
          String(input).endsWith('/api/auth/login'),
        ),
    ).toHaveLength(0)
    expect(
      screen.queryByRole('heading', { name: '회원가입이 완료되었습니다' }),
    ).not.toBeInTheDocument()
  })

  it('sends only one signup request for repeated submits', async () => {
    let signupCallCount = 0
    let resolveSignup: ((response: Response) => void) | undefined
    apiOverride = (request) => {
      if (
        request.method === 'POST' &&
        new URL(request.url).pathname === '/api/auth/signup'
      ) {
        signupCallCount += 1
        return new Promise<Response>((resolve) => {
          resolveSignup = resolve
        })
      }
    }
    renderSignup()
    completeAccountForm('one-request@example.com')
    const form = screen.getByRole('button', { name: '가입 완료' }).closest(
      'form',
    )
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    await waitFor(() => expect(signupCallCount).toBe(1))
    resolveSignup?.(
      apiSuccess({
        email: 'one-request@example.com',
        name: '학습자',
        userId: 1,
      }),
    )
    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
  })

  it('does not start automatic login after a cancelled signup resolves late', async () => {
    let signupStarted = false
    let resolveSignup: ((response: Response) => void) | undefined
    apiOverride = (request) => {
      if (
        request.method === 'POST' &&
        new URL(request.url).pathname === '/api/auth/signup'
      ) {
        signupStarted = true
        return new Promise<Response>((resolve) => {
          resolveSignup = resolve
        })
      }
    }
    renderSignup()
    completeAccountForm('cancelled@example.com')
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))
    await waitFor(() => expect(signupStarted).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '이전' }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByLabelText('비밀번호')).toHaveValue('')
    expect(screen.getByLabelText('비밀번호 확인')).toHaveValue('')
    expect(screen.getByRole('button', { name: '가입 중' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '이전' }))
    await act(async () => {
      resolveSignup?.(
        apiSuccess({
          email: 'cancelled@example.com',
          name: '학습자',
          userId: 1,
        }),
      )
      await Promise.resolve()
    })

    expect(
      await screen.findByRole('heading', { name: '회원가입이 완료되었습니다' }),
    ).toBeInTheDocument()
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(([input]) =>
          String(input).endsWith('/api/auth/login'),
        ),
    ).toHaveLength(0)
  })

  it('reports the created account without replacing another account session', async () => {
    let firstLoginStarted = false
    let resolveFirstLogin: ((response: Response) => void) | undefined
    apiOverride = async (request) => {
      const path = new URL(request.url).pathname
      if (request.method !== 'POST' || path !== '/api/auth/login') return
      const body = (await request.clone().json()) as { email: string }
      if (body.email !== 'first@example.com') return
      firstLoginStarted = true
      return new Promise<Response>((resolve) => {
        resolveFirstLogin = resolve
      })
    }
    renderSignup()
    completeAccountForm('first@example.com')
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))
    await waitFor(() => expect(firstLoginStarted).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '이전' }))
    fireEvent.click(screen.getByRole('button', { name: '다른 계정 로그인' }))
    await waitFor(() => expect(screen.getByTestId('active-auth-email')).toHaveTextContent(
      'second@example.com',
    ))

    await act(async () => {
      resolveFirstLogin?.(
        apiSuccess({
          accessToken: 'late-first-access-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
          user: {
            email: 'first@example.com',
            id: 1,
            name: '첫 번째 사용자',
            role: 'LEARNER',
          },
        }),
      )
      await Promise.resolve()
    })

    expect(
      await screen.findByRole('heading', { name: '회원가입이 완료되었습니다' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('active-auth-email')).toHaveTextContent(
      'second@example.com',
    )
    expect(
      screen.queryByText('회원가입 요청을 처리하지 못했습니다.'),
    ).not.toBeInTheDocument()
  })

  it('blocks signup when the passwords do not match', () => {
    renderSignup()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password-123' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
      target: { value: 'password-456' },
    })
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(screen.getByText('비밀번호가 일치하지 않습니다.')).toBeInTheDocument()
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(([input]) =>
          String(input).endsWith('/api/auth/signup'),
        ),
    ).toBe(false)
  })

  it('checks duplicate email after the user enters a valid address', async () => {
    renderSignup()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'existing@example.com' },
    })

    expect(
      await screen.findByText('이미 가입된 이메일입니다.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()
  })
})
