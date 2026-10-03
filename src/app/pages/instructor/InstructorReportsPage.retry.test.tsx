import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import { InstructorReportsPage } from './InstructorReportsPage'

vi.mock('../../../shared/config/capabilities', () => ({
  isApiCapabilityEnabled: () => true,
}))

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('InstructorReportsPage retry', () => {
  it('retries a failed initial load and renders the student report list', async () => {
    let studentRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname === '/api/classrooms/12') {
        return success(classroomFixture)
      }
      if (method === 'GET' && url.pathname === '/api/classrooms/12/students') {
        studentRequests += 1
        if (studentRequests === 1) {
          return failure('TEMPORARY_UNAVAILABLE', '잠시 후 다시 시도해 주세요.', 503)
        }
        return success({
          items: [{
            affiliation: '컴퓨터공학부',
            email: 'learner@example.com',
            name: '테스트 학습자',
            studentId: 31,
          }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '학습자 목록을 불러오지 못했습니다' })).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: '다시 시도' })
    retryButton.focus()
    expect(retryButton).toHaveFocus()
    fireEvent.click(retryButton)

    await waitFor(() => expect(studentRequests).toBe(2))
    expect(await screen.findByRole('region', { name: '학습자 리포트 목록' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '테스트 학습자 리포트 열기' })).toHaveAttribute(
      'href',
      '/classrooms/12/students/31/reports',
    )
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/classrooms/12/reports']}>
      <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
        <ToastProvider>
          <Routes>
            <Route path="/classrooms/:classroomId/reports" element={<InstructorReportsPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
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
    traceId: 'trace-instructor-reports',
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

const classroomFixture = {
  averageProgressRate: 38,
  classroomId: 12,
  color: 'BLUE',
  endDate: '2026-12-13',
  instructorName: '강의자',
  learnerCount: 1,
  materialCount: 1,
  name: '테스트 강의실',
  pendingRequestCount: 0,
  startDate: '2026-09-01',
  status: 'ACTIVE',
  weekCount: 15,
}
