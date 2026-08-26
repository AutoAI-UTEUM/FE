import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RequireAuth } from './RequireAuth'
import {
  AUTH_REFRESH_TIMEOUT_MS,
  AUTH_RESTORE_TIMEOUT_MS,
  AuthProvider,
} from './AuthProvider'
import { useAuth } from './useAuth'

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

  it('ends a stalled access-token renewal after waking instead of hanging', async () => {
    vi.useFakeTimers()
    let refreshCallCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)

      if (url.endsWith('/api/auth/refresh')) {
        refreshCallCount += 1

        if (refreshCallCount === 1) {
          return Promise.resolve(jsonResponse({ accessToken: 'restored-token' }))
        }

        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      }

      if (url.endsWith('/api/users/me')) {
        return Promise.resolve(
          jsonResponse({
            email: 'learner@test.com',
            name: '학습자',
            role: 'LEARNER',
            userId: 1,
          }),
        )
      }

      return Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'TOKEN_EXPIRED',
              details: [],
              message: '토큰이 만료되었습니다.',
            },
            success: false,
          },
          401,
        ),
      )
    })

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/private']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/private" element={<AuthenticatedRequestHarness />} />
            </Route>
            <Route path="/login" element={<p>로그인 화면</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: '자료 요청' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '자료 요청' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS)
    })

    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
  })
})

function AuthenticatedRequestHarness() {
  const { apiRequest } = useAuth()
  const [, setRequestFailed] = useState(false)

  return (
    <button
      onClick={() => {
        void apiRequest('/api/classrooms').catch(() => setRequestFailed(true))
      }}
      type="button"
    >
      자료 요청
    </button>
  )
}

function jsonResponse(data: unknown, status = 200) {
  const payload =
    typeof data === 'object' && data !== null && 'success' in data
      ? data
      : { data, message: '요청에 성공했습니다.', success: true }

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}
