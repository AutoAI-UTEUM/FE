import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AuthProvider } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import {
  InstructorReportDetailPage,
  InstructorStudentReportsPage,
} from './InstructorReportsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('instructor report route scope and polling recovery', () => {
  it('does not show a late report from the previous route after the current route returns 403', async () => {
    let resolveLateReport!: (response: Response) => void
    const lateReport = new Promise<Response>((resolve) => {
      resolveLateReport = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/reports/report-a') return lateReport
      if (url.pathname === '/api/reports/report-b') {
        return failure('FORBIDDEN', '접근 권한이 없습니다.', 403)
      }
      return new Response(null, { status: 404 })
    })

    renderReportRoutes(
      '/classrooms/class-a/students/student-a/reports/report-a',
      '/classrooms/class-b/students/student-b/reports/report-b',
    )

    fireEvent.click(screen.getByRole('button', { name: '다음 범위로 이동' }))
    expect(await screen.findByRole('heading', { name: '리포트를 불러오지 못했습니다' })).toBeInTheDocument()

    await act(async () => {
      resolveLateReport(success(reportFixture({
        classroomId: 'class-a',
        reportId: 'report-a',
        status: 'COMPLETED',
        studentId: 'student-a',
        studentName: '이전 학생',
      })))
      await lateReport
    })

    expect(screen.queryByRole('heading', { name: '이전 학생 리포트' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '리포트를 불러오지 못했습니다' })).toBeInTheDocument()
  })

  it('ignores a generation that completes after the classroom and student scope changed', async () => {
    let resolveGeneration!: (response: Response) => void
    const generation = new Promise<Response>((resolve) => {
      resolveGeneration = resolve
    })
    let createRequests = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname.endsWith('/reports')) {
        return success({ activeGeneration: null, items: [] })
      }
      if (method === 'GET' && url.pathname.endsWith('/weeks')) {
        return success({ items: [] })
      }
      if (
        method === 'POST'
        && url.pathname === '/api/classrooms/class-a/students/student-a/reports'
      ) {
        createRequests += 1
        return generation
      }
      return new Response(null, { status: 404 })
    })

    renderReportRoutes(
      '/classrooms/class-a/students/student-a/reports',
      '/classrooms/class-b/students/student-b/reports',
    )

    fireEvent.click(await screen.findByRole('button', { name: '새 리포트 생성' }))
    await waitFor(() => expect(createRequests).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: '다음 범위로 이동' }))
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/classrooms/class-b/students/student-b/reports',
    )

    await act(async () => {
      resolveGeneration(success(reportFixture({
        classroomId: 'class-a',
        reportId: 'late-generation',
        status: 'COMPLETED',
        studentId: 'student-a',
      }), 202))
      await generation
    })

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/classrooms/class-b/students/student-b/reports',
    )
    expect(createRequests).toBe(1)
  })

  it('keeps one 210 second lifetime for a permanently pending report', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let statusRequests = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname.endsWith('/reports')) {
        return success({
          activeGeneration: reportFixture({ pollAfterSeconds: 1 }),
          items: [],
        })
      }
      if (url.pathname.endsWith('/weeks')) return success({ items: [] })
      if (url.pathname === '/api/reports/job-1') {
        statusRequests += 1
        return success(reportFixture({ pollAfterSeconds: 1 }))
      }
      return new Response(null, { status: 404 })
    })

    renderReportRoutes('/classrooms/12/students/9/reports')

    expect(await screen.findByRole('button', { name: '리포트 생성 중' })).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(212_000)
    })

    expect(screen.getByRole('heading', { name: '리포트 생성이 지연되고 있습니다' })).toBeInTheDocument()
    expect(statusRequests).toBeGreaterThan(0)
  })

  it('retries the same job after a transient 500 and navigates once when it completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let statusRequests = 0
    let createRequests = 0
    const visitedLocations: string[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname.endsWith('/reports')) {
        return success({
          activeGeneration: statusRequests === 0 ? reportFixture() : null,
          items: [],
        })
      }
      if (method === 'GET' && url.pathname.endsWith('/weeks')) return success({ items: [] })
      if (method === 'GET' && url.pathname === '/api/reports/job-1') {
        statusRequests += 1
        if (statusRequests === 1) {
          return failure('INTERNAL_SERVER_ERROR', '일시 오류', 500)
        }
        return success(reportFixture({ status: 'COMPLETED' }))
      }
      if (method === 'POST' && url.pathname.endsWith('/reports')) {
        createRequests += 1
      }
      return new Response(null, { status: 404 })
    })

    renderReportRoutes(
      '/classrooms/12/students/9/reports',
      undefined,
      (pathname) => visitedLocations.push(pathname),
    )

    expect(await screen.findByRole('button', { name: '리포트 생성 중' })).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    const retryButton = screen.getByRole('button', { name: '상태 다시 확인' })
    fireEvent.click(retryButton)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/classrooms/12/students/9/reports/job-1',
    )
    expect(statusRequests).toBeGreaterThanOrEqual(2)
    expect(createRequests).toBe(0)
    expect(visitedLocations.filter(
      (pathname) => pathname === '/classrooms/12/students/9/reports/job-1',
    )).toHaveLength(1)
  })
})

function renderReportRoutes(
  initialPath: string,
  targetPath?: string,
  onLocationChange?: (pathname: string) => void,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider
        initialUser={{
          email: 'instructor@example.com',
          id: 7,
          name: '강의자',
          role: 'INSTRUCTOR',
        }}
      >
        <ToastProvider>
          {targetPath ? <RouteNavigation targetPath={targetPath} /> : null}
          <LocationProbe onChange={onLocationChange} />
          <Routes>
            <Route
              path="/classrooms/:classroomId/students/:studentId/reports"
              element={<InstructorStudentReportsPage />}
            />
            <Route
              path="/classrooms/:classroomId/students/:studentId/reports/:reportId"
              element={<InstructorReportDetailPage />}
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function RouteNavigation({ targetPath }: { targetPath: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(targetPath)}>다음 범위로 이동</button>
}

function LocationProbe({ onChange }: { onChange?: (pathname: string) => void }) {
  const location = useLocation()
  useEffect(() => {
    onChange?.(location.pathname)
  }, [location.pathname, onChange])
  return <output data-testid="location">{location.pathname}</output>
}

function success(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, message: 'ok', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function failure(code: string, message: string, status: number) {
  return new Response(JSON.stringify({
    error: { code, details: [], message },
    success: false,
    traceId: 'trace-report-page',
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function reportFixture(overrides: Record<string, unknown> = {}) {
  return {
    classroomId: '12',
    criterionResults: [],
    evidence: [],
    improvements: [],
    misconceptionCandidates: [],
    overallScore: null,
    recommendedActions: [],
    reportId: 'job-1',
    status: 'PROCESSING',
    strengths: [],
    studentId: '9',
    ...overrides,
  }
}
