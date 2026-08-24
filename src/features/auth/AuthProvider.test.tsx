import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RequireAuth } from './RequireAuth'
import {
  AUTH_RESTORE_TIMEOUT_MS,
  AuthProvider,
} from './AuthProvider'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('AuthProvider', () => {
  it('opens the login route when session restoration does not respond', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      }),
    )

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/private']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/private" element={<p>비공개 화면</p>} />
            </Route>
            <Route path="/login" element={<p>로그인 화면</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      '로그인 상태를 확인하는 중입니다.',
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_RESTORE_TIMEOUT_MS)
    })

    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
    expect(screen.queryByText('비공개 화면')).not.toBeInTheDocument()
  })
})
