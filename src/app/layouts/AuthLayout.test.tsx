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
    expect(within(sidebar).getByText(/Powered by/)).toHaveTextContent(
      'Powered by Grok',
    )
    expect(screen.queryByLabelText('법적 고지')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })

  it('uses the login sidebar layout on the password reset page', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/reset-password" element={<h1>비밀번호 재설정 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).queryByRole('link')).not.toBeInTheDocument()
    expect(within(sidebar).getByText(/Powered by/)).toHaveTextContent('Powered by Grok')
    expect(within(sidebar).getByText(/같은 강의/).parentElement).toHaveClass(
      'flex-1',
      'justify-center',
      'gap-5',
    )
    expect(screen.queryByLabelText('법적 고지')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })
})
