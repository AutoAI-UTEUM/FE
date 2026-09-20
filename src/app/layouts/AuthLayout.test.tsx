import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { AuthLayout } from './AuthLayout'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('AuthLayout', () => {
  it('hides the service status and divider on the signup page', () => {
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/signup" element={<h1>회원가입 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })

  it('hides the service status and divider on the forgot-password page', () => {
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/forgot-password" element={<h1>비밀번호 찾기 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })

  it('uses the focused login layout without the secondary status footer', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<h1>로그인 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText(/Powered by/)).toHaveTextContent('Powered by Grok')
    expect(screen.queryByLabelText('서비스 연결 상태')).not.toBeInTheDocument()
  })

  it('stops waiting and reports a service problem when health checks time out', async () => {
    vi.useFakeTimers()
    vi.mocked(globalThis.fetch).mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      }),
    )

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/reset-password" element={<h1>비밀번호 재설정 폼</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(
      screen.getByRole('button', { name: '서버 상태 확인 중' }),
    ).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(
      screen.getByRole('button', { name: '서버 오프라인' }),
    ).toBeEnabled()
  })
})
