import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { AuthLayout } from './AuthLayout'

afterEach(cleanup)

describe('AuthLayout', () => {
  it('uses the focused signup layout without legal or server status UI', () => {
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/signup" element={<h1>회원가입 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).queryByRole('link')).not.toBeInTheDocument()
    expect(within(sidebar).getByText(/Powered by/)).toHaveTextContent('Powered by Grok')
    expect(screen.queryByLabelText('법적 고지')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })

  it('does not render legal links or server status on secondary auth pages', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/reset-password" element={<h1>비밀번호 재설정 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText('이용약관')).not.toBeInTheDocument()
    expect(screen.queryByText('개인정보 처리방침')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })
})
