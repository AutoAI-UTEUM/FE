import { useEffect, useState, type ReactNode } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RequireAuth } from './RequireAuth'
import {
  AUTH_ACTIVITY_RECORD_INTERVAL_MS,
  AUTH_IDLE_TIMEOUT_MS,
  AUTH_IDLE_WARNING_MS,
  AUTH_REFRESH_EARLY_MS,
  AUTH_REFRESH_TIMEOUT_MS,
  AUTH_RESTORE_TIMEOUT_MS,
  AuthProvider,
} from './AuthProvider'
import { useAuth } from './useAuth'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  vi.stubGlobal('BroadcastChannel', undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

  it('keeps the session when access-token renewal temporarily times out', async () => {
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

    expect(screen.getByText('비공개 화면')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('요청을 완료하지 못했습니다.')
    expect(screen.queryByText('로그인 화면')).not.toBeInTheDocument()
  })

  it('ends the session when access-token renewal is rejected with 401', async () => {
    let refreshCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        refreshCallCount += 1
        if (refreshCallCount === 1) return Promise.resolve(jsonResponse({ accessToken: 'restored-token' }))
        return Promise.resolve(jsonResponse({ error: { code: 'TOKEN_INVALID', details: [], message: '만료된 세션입니다.' }, success: false }, 401))
      }
      if (url.endsWith('/api/users/me')) {
        return Promise.resolve(jsonResponse({ email: 'learner@test.com', name: '학습자', role: 'LEARNER', userId: 1 }))
      }
      return Promise.resolve(jsonResponse({ error: { code: 'TOKEN_EXPIRED', details: [], message: '토큰이 만료되었습니다.' }, success: false }, 401))
    })

    renderAuthenticatedRoute(<AuthenticatedRequestHarness />)
    expect(await screen.findByRole('button', { name: '자료 요청' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '자료 요청' }))

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
  })

  it('ends the session when the retried request is also unauthorized', async () => {
    let refreshCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        refreshCallCount += 1
        return Promise.resolve(
          jsonResponse({
            accessToken:
              refreshCallCount === 1 ? 'restored-token' : 'renewed-token',
          }),
        )
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

    renderAuthenticatedRoute(<AuthenticatedRequestHarness />)
    fireEvent.click(
      await screen.findByRole('button', { name: '자료 요청' }),
    )

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
    expect(refreshCallCount).toBe(2)
  })

  it('records repeated input at most once per five minutes', async () => {
    vi.useFakeTimers()
    let activityCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        return Promise.resolve(jsonResponse(createAccessGrantResponse()))
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
      if (url.endsWith('/api/auth/session/activity')) {
        activityCallCount += 1
        return Promise.resolve(jsonResponse(createSessionPolicy()))
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })

    renderAuthenticatedRoute(<p>비공개 화면</p>)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_ACTIVITY_RECORD_INTERVAL_MS)
    })
    fireEvent.pointerDown(window)
    fireEvent.keyDown(window, { key: 'A' })
    fireEvent.scroll(window)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(activityCallCount).toBe(1)
  })

  it('uses refresh when activity races with access-token expiry', async () => {
    vi.useFakeTimers()
    let activityCallCount = 0
    let refreshCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        refreshCallCount += 1
        return Promise.resolve(
          jsonResponse(
            createAccessGrantResponse(`access-token-${refreshCallCount}`),
          ),
        )
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
      if (url.endsWith('/api/auth/session/activity')) {
        activityCallCount += 1
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
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })

    renderAuthenticatedRoute(<p>비공개 화면</p>)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(AUTH_ACTIVITY_RECORD_INTERVAL_MS)
    })
    fireEvent.pointerDown(window)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(activityCallCount).toBe(1)
    expect(refreshCallCount).toBe(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retries failed activity without rotating the refresh token', async () => {
    vi.useFakeTimers()
    let activityCallCount = 0
    let refreshCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        refreshCallCount += 1
        return Promise.resolve(jsonResponse(createAccessGrantResponse()))
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
      if (url.endsWith('/api/auth/session/activity')) {
        activityCallCount += 1
        if (activityCallCount === 1) {
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'SERVICE_UNAVAILABLE',
                  details: [],
                  message: '잠시 후 다시 시도해 주세요.',
                },
                success: false,
              },
              503,
            ),
          )
        }
        return Promise.resolve(jsonResponse(createSessionPolicy()))
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })

    renderAuthenticatedRoute(<p>비공개 화면</p>)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(AUTH_ACTIVITY_RECORD_INTERVAL_MS)
    })
    fireEvent.pointerDown(window)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(
      screen.getByText(
        '세션 활동 기록을 잠시 완료하지 못했습니다. 다음 활동에서 다시 시도합니다.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 연결' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(activityCallCount).toBe(2)
    expect(refreshCallCount).toBe(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refreshes five minutes before expiry only after recent user activity', async () => {
    vi.useFakeTimers()
    let refreshCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        refreshCallCount += 1
        return Promise.resolve(
          jsonResponse(
            createAccessGrantResponse(`access-token-${refreshCallCount}`),
          ),
        )
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
      if (url.endsWith('/api/auth/session/activity')) {
        return Promise.resolve(jsonResponse(createSessionPolicy()))
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })

    renderAuthenticatedRoute(<p>비공개 화면</p>)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        15 * 60 * 1000 - AUTH_REFRESH_EARLY_MS - 60_000,
      )
    })
    fireEvent.pointerDown(window)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(refreshCallCount).toBe(2)
  })

  it('warns before idle logout during an exam and lets the learner continue', async () => {
    vi.useFakeTimers()
    mockRestoredSession()
    renderAuthenticatedRoute(<ExamProgressHarness />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_IDLE_WARNING_MS)
    })

    expect(screen.getByRole('dialog', { name: '계속 응시 중이신가요?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '계속 응시' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_IDLE_TIMEOUT_MS - AUTH_IDLE_WARNING_MS)
    })

    expect(screen.getByText('시험 화면')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the existing idle logout when the exam warning is ignored', async () => {
    vi.useFakeTimers()
    mockRestoredSession()
    renderAuthenticatedRoute(<ExamProgressHarness />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_IDLE_WARNING_MS)
    })
    expect(screen.getByRole('dialog', { name: '계속 응시 중이신가요?' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_IDLE_TIMEOUT_MS - AUTH_IDLE_WARNING_MS)
    })

    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
  })

  it('does not let a hidden exam tab bypass the server idle policy', async () => {
    vi.useFakeTimers()
    let visibilityState: DocumentVisibilityState = 'hidden'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    mockRestoredSession()
    renderAuthenticatedRoute(<ExamProgressHarness />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_IDLE_TIMEOUT_MS)
    })
    expect(screen.getByText('시험 화면')).toBeInTheDocument()

    visibilityState = 'visible'
    fireEvent(document, new Event('visibilitychange'))

    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses the role-specific idle timeout returned by the server', async () => {
    vi.useFakeTimers()
    mockRestoredSession(createAccessGrantResponse())
    renderAuthenticatedRoute(<p>비공개 화면</p>)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_IDLE_TIMEOUT_MS)
    })
    expect(screen.getByText('비공개 화면')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        createSessionPolicy().idleTimeoutSeconds * 1000 -
          AUTH_IDLE_TIMEOUT_MS,
      )
    })
    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
  })
})

function AuthenticatedRequestHarness() {
  const { apiRequest } = useAuth()
  const [requestFailed, setRequestFailed] = useState(false)

  return (
    <>
      <p>비공개 화면</p>
      <button
        onClick={() => {
          void apiRequest('/api/classrooms').catch(() => setRequestFailed(true))
        }}
        type="button"
      >
        자료 요청
      </button>
      {requestFailed ? <p role="status">요청을 완료하지 못했습니다.</p> : null}
    </>
  )
}

function ExamProgressHarness() {
  const { setExamInProgress } = useAuth()

  useEffect(() => {
    setExamInProgress(true)
    return () => setExamInProgress(false)
  }, [setExamInProgress])

  return <p>시험 화면</p>
}

function renderAuthenticatedRoute(element: ReactNode) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/private" element={element} />
          </Route>
          <Route path="/login" element={<p>로그인 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

function mockRestoredSession(
  refreshResponse: Record<string, unknown> = { accessToken: 'restored-token' },
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.endsWith('/api/auth/refresh')) return Promise.resolve(jsonResponse(refreshResponse))
    if (url.endsWith('/api/users/me')) {
      return Promise.resolve(jsonResponse({ email: 'learner@test.com', name: '학습자', role: 'LEARNER', userId: 1 }))
    }
    if (url.endsWith('/api/auth/logout')) return Promise.resolve(jsonResponse(null))
    return Promise.resolve(new Response(null, { status: 404 }))
  })
}

function createAccessGrantResponse(accessToken = 'restored-token') {
  return {
    accessToken,
    expiresIn: 15 * 60,
    session: createSessionPolicy(),
  }
}

function createSessionPolicy() {
  const now = Date.now()
  return {
    absoluteExpiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
    idleExpiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    idleTimeoutSeconds: 2 * 60 * 60,
  }
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
