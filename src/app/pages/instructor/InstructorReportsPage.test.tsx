import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { AuthProvider, useAuth } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import {
  InstructorReportDetailPage,
  InstructorReportsPage,
  InstructorStudentReportsPage,
} from './InstructorReportsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('instructor report route scope and polling recovery', () => {
  it.each([403, 404])('does not show a late classroom report list after the next classroom returns %s', async (status) => {
    let resolveLateClassroom!: (response: Response) => void
    const lateClassroom = new Promise<Response>((resolve) => {
      resolveLateClassroom = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms/class-a') return lateClassroom
      if (url.pathname === '/api/classrooms/class-b') {
        return failure(
          status === 403 ? 'FORBIDDEN' : 'NOT_FOUND',
          status === 403 ? '접근 권한이 없습니다.' : '강의실을 찾을 수 없습니다.',
          status,
        )
      }
      if (url.pathname.endsWith('/students')) {
        return success({
          items: [studentFixture({ name: url.pathname.includes('class-a') ? '이전 학생' : '현재 학생' })],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    renderClassroomReportRoutes('/classrooms/class-a/reports', '/classrooms/class-b/reports')

    fireEvent.click(screen.getByRole('button', { name: '다음 범위로 이동' }))
    expect(await screen.findByRole('heading', { name: '학습자 목록을 불러오지 못했습니다' })).toBeInTheDocument()

    await act(async () => {
      resolveLateClassroom(success(classroomFixture({ classroomId: 'class-a', name: '이전 강의실' })))
      await lateClassroom
    })

    expect(screen.queryByText('이전 학생')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '학습자 목록을 불러오지 못했습니다' })).toBeInTheDocument()
  })

  it('resets search results when the classroom scope changes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms/search-a') {
        return success(classroomFixture({ classroomId: 'search-a', name: 'A 강의실' }))
      }
      if (url.pathname === '/api/classrooms/search-b') {
        return success(classroomFixture({ classroomId: 'search-b', name: 'B 강의실' }))
      }
      if (url.pathname.endsWith('/students')) {
        const isFirstClassroom = url.pathname.includes('search-a')
        return success({
          items: [studentFixture({
            email: isFirstClassroom ? 'alpha@example.com' : 'beta@example.com',
            name: isFirstClassroom ? '알파 학생' : '베타 학생',
            studentId: isFirstClassroom ? 'student-a' : 'student-b',
          })],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    renderClassroomReportRoutes('/classrooms/search-a/reports', '/classrooms/search-b/reports')

    const search = await screen.findByRole('searchbox', { name: '리포트 학습자 검색' })
    fireEvent.change(search, { target: { value: '알파' } })
    expect(screen.getByText('알파 학생')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 범위로 이동' }))

    expect(await screen.findByText('베타 학생')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '리포트 학습자 검색' })).toHaveValue('')
  })

  it('isolates the classroom report list when the authenticated owner changes', async () => {
    let classroomRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms/owner-a') {
        classroomRequests += 1
        if (classroomRequests === 1) {
          return success(classroomFixture({ classroomId: 'owner-a', name: '첫 소유자 강의실' }))
        }
        return failure('FORBIDDEN', '접근 권한이 없습니다.', 403)
      }
      if (url.pathname.endsWith('/students')) {
        return success({
          items: [studentFixture({ name: '첫 소유자 학생' })],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    renderClassroomReportRoutes('/classrooms/owner-a/reports', undefined, true)

    expect(await screen.findByText('첫 소유자 학생')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '소유자 변경' }))

    expect(await screen.findByRole('heading', { name: '학습자 목록을 불러오지 못했습니다' })).toBeInTheDocument()
    expect(screen.queryByText('첫 소유자 학생')).not.toBeInTheDocument()
    expect(classroomRequests).toBe(2)
  })

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

  it('resets generation controls and does not revive stale state after returning to a scope', async () => {
    let resolveGeneration!: (response: Response) => void
    const generation = new Promise<Response>((resolve) => {
      resolveGeneration = resolve
    })
    let createRequests = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      const isFirstScope = url.pathname.includes('/classrooms/class-a/')

      if (method === 'GET' && url.pathname.endsWith('/reports')) {
        return success({ activeGeneration: null, items: [] })
      }
      if (method === 'GET' && url.pathname.endsWith('/weeks')) {
        return success({
          items: isFirstScope ? [weekFixture({ weekNumber: 3 })] : [],
        })
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
      undefined,
      '/classrooms/class-a/students/student-a/reports',
    )

    fireEvent.click(await screen.findByRole('radio', { name: '주차 선택' }))
    fireEvent.change(screen.getByLabelText('분석 주차'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '새 리포트 생성' }))
    await waitFor(() => expect(createRequests).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: '다음 범위로 이동' }))
    expect(await screen.findByRole('radio', { name: '전체 기간' })).toBeChecked()
    expect(screen.queryByLabelText('분석 주차')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '이전 범위로 이동' }))
    expect(await screen.findByRole('radio', { name: '전체 기간' })).toBeChecked()
    expect(screen.getByRole('button', { name: '새 리포트 생성' })).toBeEnabled()

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
      '/classrooms/class-a/students/student-a/reports',
    )
    expect(screen.getByRole('button', { name: '새 리포트 생성' })).toBeEnabled()
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
  returnPath?: string,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider initialUser={instructorUserFixture}>
        <ToastProvider>
          {targetPath ? <RouteNavigation returnPath={returnPath} targetPath={targetPath} /> : null}
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

function renderClassroomReportRoutes(
  initialPath: string,
  targetPath?: string,
  includeOwnerNavigation = false,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider initialUser={instructorUserFixture}>
        <ToastProvider>
          {targetPath ? <RouteNavigation targetPath={targetPath} /> : null}
          {includeOwnerNavigation ? <OwnerNavigation /> : null}
          <Routes>
            <Route
              path="/classrooms/:classroomId/reports"
              element={<InstructorReportsPage />}
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function RouteNavigation({
  returnPath,
  targetPath,
}: {
  returnPath?: string
  targetPath: string
}) {
  const navigate = useNavigate()
  return <>
    <button onClick={() => navigate(targetPath)}>다음 범위로 이동</button>
    {returnPath ? <button onClick={() => navigate(returnPath)}>이전 범위로 이동</button> : null}
  </>
}

function OwnerNavigation() {
  const { updateUser, user } = useAuth()
  return <button
    onClick={() => {
      if (!user) return
      updateUser({ ...user, email: 'next-owner@example.com', id: 8 })
    }}
  >소유자 변경</button>
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

function classroomFixture(overrides: Record<string, unknown> = {}) {
  return {
    classroomId: 'class-a',
    color: 'BLUE',
    description: '리포트 테스트 강의실',
    endDate: '2026-12-31',
    instructorName: '강의자',
    inviteCode: 'REPORT-TEST',
    learnerCount: 1,
    name: '리포트 강의실',
    pendingRequestCount: 0,
    progressRate: 50,
    startDate: '2026-09-01',
    status: 'ACTIVE',
    weekCount: 3,
    ...overrides,
  }
}

function studentFixture(overrides: Record<string, unknown> = {}) {
  return {
    affiliation: '테스트 소속',
    email: 'student@example.com',
    latestReport: null,
    name: '테스트 학생',
    studentId: 'student-a',
    ...overrides,
  }
}

function weekFixture(overrides: Record<string, unknown> = {}) {
  return {
    materials: [],
    releaseAt: '2026-09-15T00:00:00Z',
    status: 'PUBLISHED',
    title: '리포트 테스트 주차',
    weekNumber: 1,
    ...overrides,
  }
}

const instructorUserFixture = {
  email: 'instructor@example.com',
  id: 7,
  name: '강의자',
  role: 'INSTRUCTOR' as const,
}
