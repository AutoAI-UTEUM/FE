import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../features/auth'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { SignupPage } from './SignupPage'

beforeEach(() => {
  installApiFixtureServer()
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
    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('비밀번호를 입력하세요.')).toBeInTheDocument()
    expect(
      screen.getByText('비밀번호를 한 번 더 입력하세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('필수 약관에 동의해 주세요.')).toBeInTheDocument()
  })

  it('shows password strength without optional profile fields', () => {
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

    expect(screen.queryByLabelText(/소속/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /학습 소식 이메일 수신/ })).not.toBeInTheDocument()
  })

  it('signs up, auto-logs-in, and redirects to classrooms', async () => {
    renderSignup()

    fireEvent.click(screen.getByRole('radio', { name: /^강의자/ }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '학습자' },
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
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /이용약관 및 개인정보 처리방침 동의/,
      }),
    )
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
      learningEmailOptIn: false,
      role: 'INSTRUCTOR',
    })
    expect(signupBody).not.toHaveProperty('affiliation')
    expect(signupBody).not.toHaveProperty('confirmPassword')
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
