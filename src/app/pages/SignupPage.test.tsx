import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../features/auth'
import { apiFailure, apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { SignupPage } from './SignupPage'

let apiOverride: ((request: Request) => Response | undefined) | undefined

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
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/classrooms" element={<p>내 강의실 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
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
    expect(screen.queryByText('필수 약관에 동의해 주세요.')).not.toBeInTheDocument()
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

  it('signs up without sending consents when the user did not agree', async () => {
    apiOverride = (request) =>
      request.method === 'GET' && new URL(request.url).pathname === '/api/policies/current'
        ? apiSuccess([
            { requiresConsent: false, title: '이용약관', type: 'TERMS', version: '0.9' },
            { requiresConsent: false, title: '개인정보 처리방침', type: 'PRIVACY', version: '0.9' },
          ])
        : undefined
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
    await screen.findByRole('button', { name: '이용약관 보기' })
    fireEvent.click(screen.getByRole('checkbox', { name: /만 14세 이상입니다/ }))
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

  it('sends only the current policy explicitly marked as requiring consent', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'policy-consent')
    renderSignup()

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

    fireEvent.click(screen.getByRole('checkbox', { name: /만 14세 이상입니다/ }))
    const consent = await screen.findByRole('checkbox', { name: /이용약관에 동의합니다/ })
    fireEvent.click(consent)
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
    const signupCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([input]) => String(input).endsWith('/api/auth/signup'))
    expect(JSON.parse(String(signupCall?.[1]?.body)).consents).toEqual([
      { type: 'TERMS', version: '0.9' },
    ])
  })

  it('opens the current terms and privacy documents from the consent field', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'policy-consent')
    renderSignup()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    const termsButton = await screen.findByRole('button', { name: '이용약관 보기' })
    const privacyButton = screen.getByRole('button', {
      name: '개인정보 처리방침 보기',
    })
    await waitFor(() => {
      expect(termsButton).toBeEnabled()
      expect(privacyButton).toBeEnabled()
    })

    fireEvent.click(termsButton)
    const termsDialog = await screen.findByRole('dialog', { name: '이용약관' })
    expect(
      await within(termsDialog).findByText(/본 약관은 으뜸 서비스 이용 조건을 정합니다/),
    ).toBeInTheDocument()
    fireEvent.click(
      within(termsDialog).getByRole('button', { name: '이용약관 닫기' }),
    )

    fireEvent.click(privacyButton)
    const privacyDialog = await screen.findByRole('dialog', {
      name: '개인정보 처리방침',
    })
    expect(
      await within(privacyDialog).findByText(/서비스 제공에 필요한 개인정보를 처리합니다/),
    ).toBeInTheDocument()
    fireEvent.mouseDown(privacyDialog)
    expect(
      screen.queryByRole('dialog', { name: '개인정보 처리방침' }),
    ).not.toBeInTheDocument()
  })

  it('shows the consent requirement when the server enables mandatory consent', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'policy-consent')
    apiOverride = (request) =>
      request.method === 'POST' && new URL(request.url).pathname === '/api/auth/signup'
        ? apiFailure(
            'POLICY_CONSENT_REQUIRED',
            '현재 정책 동의가 필요합니다.',
            400,
          )
        : undefined
    renderSignup()

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
    fireEvent.click(screen.getByRole('checkbox', { name: /만 14세 이상입니다/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /이용약관에 동의합니다/ }))
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(
      await screen.findByText('가입을 계속하려면 현재 약관에 동의해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('내 강의실 화면')).not.toBeInTheDocument()
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
