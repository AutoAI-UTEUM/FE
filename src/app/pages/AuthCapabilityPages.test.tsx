import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { ResetPasswordPage } from './AuthCapabilityPages'

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
