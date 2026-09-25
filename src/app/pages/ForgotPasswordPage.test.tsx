import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { ForgotPasswordPage } from './ForgotPasswordPage'

beforeEach(() => {
  vi.stubEnv('VITE_API_CAPABILITIES', 'password-reset')
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderForgotPassword() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route
          path="/forgot-password"
          element={<ForgotPasswordPage />}
        />
        <Route path="/login" element={<p>로그인 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  it('does not show the reset-link introduction', () => {
    renderForgotPassword()

    expect(
      screen.queryByText('가입한 이메일로 재설정 링크를 보내드려요'),
    ).not.toBeInTheDocument()
  })

  it('validates an empty email', () => {
    renderForgotPassword()

    fireEvent.click(
      screen.getByRole('button', { name: '재설정 링크 보내기' }),
    )

    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
  })

  it('validates the email format', () => {
    renderForgotPassword()

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'invalid-email' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '재설정 링크 보내기' }),
    )

    expect(screen.getByText('이메일 형식을 확인하세요.')).toBeInTheDocument()
  })

  it('requests a reset email and shows the privacy-safe server message', async () => {
    renderForgotPassword()

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'learner@example.com' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '재설정 링크 보내기' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      '등록된 이메일이면 재설정 안내를 발송했습니다.',
    )
  })

  it('returns to the login page', () => {
    renderForgotPassword()

    fireEvent.click(
      screen.getByRole('link', { name: '로그인으로 돌아가기' }),
    )

    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
  })
})
