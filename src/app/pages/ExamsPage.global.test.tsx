import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

import { AuthContext, type AuthContextValue, type AuthUser } from '../../features/auth/authContext'
import type { AuthenticatedRequest } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ExamsPage } from './ExamsPage'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  vi.stubEnv('VITE_API_CAPABILITIES', 'reports,policy-consent')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('ExamsPage global list isolation and recovery', () => {
  it('renders a confirmed empty classroom result without requesting exams or showing a failure', async () => {
    const request: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return apiSuccess(classroomPage([]))
      throw new Error(`Unexpected request: ${path}`)
    })

    renderGlobal(request)

    expect(await screen.findByRole('heading', { name: '등록된 시험이 없습니다' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '시험을 불러오지 못했습니다' })).not.toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps pending and failed classroom discovery distinct from an empty exam list, then retries discovery', async () => {
    const firstClassrooms = deferred<ReturnType<typeof apiSuccess>>()
    let classroomRequests = 0
    const request: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) {
        classroomRequests += 1
        if (classroomRequests === 1) return firstClassrooms.promise
        return apiSuccess(classroomPage([classroom(12, 'Recovered classroom')]))
      }
      if (path.startsWith('/api/classrooms/12/exams?')) {
        return apiSuccess(examPage([exam(120, 'Recovered exam')]))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    renderGlobal(request)

    expect(screen.getByText('시험을 불러오는 중입니다.')).toBeInTheDocument()
    expect(screen.queryByText('Recovered exam')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '시험을 불러오지 못했습니다' })).not.toBeInTheDocument()

    await act(async () => {
      firstClassrooms.reject(new Error('classroom discovery failed'))
    })

    const failure = await screen.findByRole('heading', { name: '시험을 불러오지 못했습니다' })
    expect(failure).toBeInTheDocument()
    expect(screen.queryByText('Recovered exam')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Recovered exam')).toBeInTheDocument()
    expect(classroomRequests).toBe(2)
  })

  it('preserves successful classrooms, identifies failed classrooms, and retries only failures once', async () => {
    const retry = deferred<ReturnType<typeof apiSuccess>>()
    const requestedPaths: string[] = []
    let failedClassroomRequests = 0
    const request: AuthenticatedRequest = mockRequest(async (path) => {
      requestedPaths.push(path)
      if (path.startsWith('/api/classrooms?')) {
        return apiSuccess(classroomPage([
          classroom(12, 'Stable classroom'),
          classroom(13, 'Retry classroom'),
        ]))
      }
      if (path.startsWith('/api/classrooms/12/exams?')) {
        return apiSuccess(examPage([exam(120, 'Stable exam')]))
      }
      if (path.startsWith('/api/classrooms/13/exams?')) {
        failedClassroomRequests += 1
        if (failedClassroomRequests === 1) throw new Error('retry classroom unavailable')
        return retry.promise
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    renderGlobal(request)

    expect(await screen.findByText('Stable exam')).toBeInTheDocument()
    expect(await screen.findByText(/Retry classroom/)).toBeInTheDocument()
    expect(screen.queryByText('Recovered retry exam')).not.toBeInTheDocument()

    const retryButton = screen.getByRole('button')
    fireEvent.click(retryButton)
    fireEvent.click(retryButton)

    await waitFor(() => expect(failedClassroomRequests).toBe(2))
    expect(requestedPaths.filter((path) => path.startsWith('/api/classrooms/12/exams?'))).toHaveLength(1)
    expect(screen.getByText('Stable exam')).toBeInTheDocument()

    await act(async () => {
      retry.resolve(apiSuccess(examPage([exam(130, 'Recovered retry exam')])))
    })

    expect(await screen.findByText('Recovered retry exam')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('clears the previous account cards while the replacement account reloads', async () => {
    const accountBClassrooms = deferred<ReturnType<typeof apiSuccess>>()
    const requestA: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return apiSuccess(classroomPage([classroom(12, 'Account A')]))
      if (path.startsWith('/api/classrooms/12/exams?')) return apiSuccess(examPage([exam(120, 'Account A exam')]))
      throw new Error(`Unexpected A request: ${path}`)
    })
    const requestB: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return accountBClassrooms.promise
      if (path.startsWith('/api/classrooms/22/exams?')) return apiSuccess(examPage([exam(220, 'Account B exam')]))
      throw new Error(`Unexpected B request: ${path}`)
    })

    const view = renderGlobal(requestA, user(1, 'a@example.com'))
    expect(await screen.findByText('Account A exam')).toBeInTheDocument()

    view.rerender(globalTree(requestB, user(2, 'b@example.com')))

    await waitFor(() => expect(requestB).toHaveBeenCalledWith(
      expect.stringContaining('/api/classrooms?'),
      expect.anything(),
    ))
    expect(screen.queryByText('Account A exam')).not.toBeInTheDocument()
    await act(async () => {
      accountBClassrooms.resolve(apiSuccess(classroomPage([classroom(22, 'Account B')])))
    })
    expect(await screen.findByText('Account B exam')).toBeInTheDocument()
  })

  it('rejects late classroom discovery from a previous account', async () => {
    const accountAClassrooms = deferred<ReturnType<typeof apiSuccess>>()
    const requestA: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return accountAClassrooms.promise
      if (path.startsWith('/api/classrooms/12/exams?')) return apiSuccess(examPage([exam(120, 'Late Account A exam')]))
      throw new Error(`Unexpected A request: ${path}`)
    })
    const requestB: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return apiSuccess(classroomPage([classroom(22, 'Account B')]))
      if (path.startsWith('/api/classrooms/22/exams?')) return apiSuccess(examPage([exam(220, 'Account B exam')]))
      throw new Error(`Unexpected B request: ${path}`)
    })

    const view = renderGlobal(requestA, user(1, 'a@example.com'))
    await waitFor(() => expect(requestA).toHaveBeenCalled())
    view.rerender(globalTree(requestB, user(2, 'b@example.com')))

    expect(await screen.findByText('Account B exam')).toBeInTheDocument()
    await act(async () => {
      accountAClassrooms.resolve(apiSuccess(classroomPage([classroom(12, 'Account A')])))
    })

    await waitFor(() => expect(screen.getByText('Account B exam')).toBeInTheDocument())
    expect(screen.queryByText('Late Account A exam')).not.toBeInTheDocument()
    expect(requestB).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/classrooms/12/exams?'),
      expect.anything(),
    )
  })

  it('rejects a late exam list success from a previous account', async () => {
    const accountAExams = deferred<ReturnType<typeof apiSuccess>>()
    const requestA: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return apiSuccess(classroomPage([classroom(12, 'Account A')]))
      if (path.startsWith('/api/classrooms/12/exams?')) return accountAExams.promise
      throw new Error(`Unexpected A request: ${path}`)
    })
    const requestB: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) return apiSuccess(classroomPage([classroom(22, 'Account B')]))
      if (path.startsWith('/api/classrooms/22/exams?')) return apiSuccess(examPage([exam(220, 'Account B exam')]))
      throw new Error(`Unexpected B request: ${path}`)
    })

    const view = renderGlobal(requestA, user(1, 'a@example.com'))
    await waitFor(() => expect(requestA).toHaveBeenCalledWith(
      expect.stringContaining('/api/classrooms/12/exams?'),
      expect.anything(),
    ))
    view.rerender(globalTree(requestB, user(2, 'b@example.com')))

    expect(await screen.findByText('Account B exam')).toBeInTheDocument()
    await act(async () => {
      accountAExams.resolve(apiSuccess(examPage([exam(120, 'Late Account A exam')])))
    })

    await waitFor(() => expect(screen.getByText('Account B exam')).toBeInTheDocument())
    expect(screen.queryByText('Late Account A exam')).not.toBeInTheDocument()
  })

  it('rejects a late global response after navigating to a classroom route', async () => {
    const globalExams = deferred<ReturnType<typeof apiSuccess>>()
    const request: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) {
        return apiSuccess(classroomPage([classroom(12, 'Route classroom')]))
      }
      if (path.startsWith('/api/classrooms/12/exams?')) {
        const url = new URL(path, 'http://localhost')
        if (!url.searchParams.has('status') && globalExams.pending) return globalExams.promise
        return apiSuccess(examPage([exam(121, 'Classroom route exam')]))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    render(
      <AuthHarness request={request} user={user(1, 'learner@example.com')}>
        <MemoryRouter initialEntries={['/exams']}>
          <RouteSwitch />
          <ToastProvider>
            <Routes>
              <Route element={<ExamsPage />} path="/exams" />
              <Route element={<ExamsPage />} path="/classrooms/:classroomId/exams" />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </AuthHarness>,
    )

    await waitFor(() => expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/api/classrooms/12/exams?'),
      expect.anything(),
    ))
    fireEvent.click(screen.getByRole('button', { name: 'classroom route' }))
    globalExams.pending = false

    expect(await screen.findByText('Classroom route exam')).toBeInTheDocument()
    await act(async () => {
      globalExams.resolve(apiSuccess(examPage([exam(120, 'Late global exam')])))
    })
    expect(screen.queryByText('Late global exam')).not.toBeInTheDocument()
  })

  it('applies the selected status with stable page sizing and renders the exact combined count', async () => {
    const requestedExamPaths: string[] = []
    const request: AuthenticatedRequest = mockRequest(async (path) => {
      if (path.startsWith('/api/classrooms?')) {
        return apiSuccess(classroomPage([
          classroom(12, 'First classroom'),
          classroom(13, 'Second classroom'),
        ]))
      }
      if (path.startsWith('/api/classrooms/12/exams?')) {
        requestedExamPaths.push(path)
        return apiSuccess(examPage(path.includes('status=PUBLISHED') ? [exam(121, 'First published')] : []))
      }
      if (path.startsWith('/api/classrooms/13/exams?')) {
        requestedExamPaths.push(path)
        return apiSuccess(examPage(path.includes('status=PUBLISHED') ? [exam(131, 'Second published')] : []))
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    renderGlobal(request)
    const status = await screen.findByRole('combobox')
    fireEvent.change(status, { target: { value: 'PUBLISHED' } })

    expect(await screen.findByText('First published')).toBeInTheDocument()
    expect(screen.getByText('Second published')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    const filteredPaths = requestedExamPaths.filter((path) => path.includes('status=PUBLISHED'))
    expect(filteredPaths).toHaveLength(2)
    for (const path of filteredPaths) {
      const url = new URL(path, 'http://localhost')
      expect(url.searchParams.get('page')).toBe('0')
      expect(url.searchParams.get('size')).toBe('100')
      expect(url.searchParams.get('status')).toBe('PUBLISHED')
    }
  })
})

function renderGlobal(request: AuthenticatedRequest, authUser = user(1, 'learner@example.com')) {
  return render(globalTree(request, authUser))
}

function globalTree(request: AuthenticatedRequest, authUser: AuthUser) {
  return <AuthHarness request={request} user={authUser}>
    <MemoryRouter initialEntries={['/exams']}>
      <ToastProvider>
        <Routes><Route element={<ExamsPage />} path="/exams" /></Routes>
      </ToastProvider>
    </MemoryRouter>
  </AuthHarness>
}

function AuthHarness({ children, request, user: authUser }: { children: ReactNode; request: AuthenticatedRequest; user: AuthUser }) {
  const value = useMemo<AuthContextValue>(() => ({
    apiRequest: request,
    checkEmailAvailability: async () => true,
    clearGoogleSignup: () => undefined,
    isAuthenticated: true,
    isInitializing: false,
    login: async () => authUser,
    loginWithGoogle: async () => authUser,
    logout: async () => undefined,
    logoutReason: null,
    pendingGoogleIdToken: null,
    prepareGoogleSignup: () => undefined,
    rawApiRequest: async () => new Response(),
    setExamInProgress: () => undefined,
    signup: async () => ({ status: 'authenticated' }),
    updateUser: () => undefined,
    user: authUser,
    withdraw: async () => undefined,
  }), [authUser, request])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function RouteSwitch() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/classrooms/12/exams')} type="button">classroom route</button>
}

function user(id: number, email: string): AuthUser {
  return { email, id, name: email, role: 'LEARNER' }
}

function classroom(classroomId: number, name: string) {
  return {
    classroomId,
    color: 'BLUE',
    description: name,
    endDate: '2026-12-31',
    instructorName: 'Instructor',
    learnerCount: 1,
    name,
    pendingRequestCount: 0,
    progressRate: 0,
    startDate: '2026-01-01',
    status: 'ACTIVE',
    weekCount: 1,
  }
}

function exam(examId: number, title: string) {
  return {
    allowRetake: false,
    closedAt: null,
    description: null,
    dueAt: null,
    examId,
    latestSubmission: null,
    publishedAt: '2026-01-01T00:00:00Z',
    status: 'PUBLISHED',
    submittable: true,
    title,
    totalScore: 10,
    weekNumber: 1,
  }
}

function classroomPage(items: ReturnType<typeof classroom>[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: items.length ? 1 : 0 }
}

function examPage(items: ReturnType<typeof exam>[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: items.length ? 1 : 0 }
}

function apiSuccess<T>(data: T) {
  return { data, message: 'ok', success: true as const }
}

function mockRequest(
  implementation: (path: string) => Promise<ReturnType<typeof apiSuccess>>,
): AuthenticatedRequest {
  return vi.fn(implementation) as unknown as AuthenticatedRequest
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const result = {
    pending: true,
    promise: new Promise<T>((nextResolve, nextReject) => {
      resolve = nextResolve
      reject = nextReject
    }),
    reject: (reason?: unknown) => {
      result.pending = false
      reject(reason)
    },
    resolve: (value: T) => {
      result.pending = false
      resolve(value)
    },
  }
  return result
}
