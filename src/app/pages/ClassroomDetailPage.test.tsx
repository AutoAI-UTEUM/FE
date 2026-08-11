import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ClassroomDetailPage } from './ClassroomDetailPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ClassroomDetailPage instructor materials', () => {
  it('renders the classroom resource table in week order and uploads a dropped PDF', async () => {
    let weekListCalls = 0
    let uploadedValues: {
      classroomId: FormDataEntryValue | null
      file: FormDataEntryValue | null
      weekNumber: FormDataEntryValue | null
    } | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        'http://localhost',
      )

      if (url.pathname === '/api/classrooms/12') {
        return success(classroomFixture)
      }
      if (url.pathname === '/api/classrooms/12/weeks') {
        weekListCalls += 1
        return success({
          items: [
            { ...weekFixture, releaseAt: '2026-08-10T09:07:42', title: '심화', weekNumber: 2 },
            {
              ...weekFixture,
              materials: weekListCalls > 1 ? [{
                materialId: 91,
                pageCount: 12,
                processingStatus: 'READY',
                title: 'lecture.pdf',
                uploadedAt: '2026-08-02T00:00:00Z',
                viewerCount: 9,
                viewRate: 38,
              }] : [],
            },
          ],
        })
      }
      if (url.pathname === '/api/classrooms/12/notices') {
        return success({
          items: [],
          page: 0,
          size: 100,
          totalElements: 0,
          totalPages: 0,
        })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/materials' && init?.method === 'POST') {
        const body = init.body as FormData
        uploadedValues = {
          classroomId: body.get('classroomId'),
          file: body.get('file'),
          weekNumber: body.get('weekNumber'),
        }
        return success({
          createdAt: '2026-08-02T00:00:00Z',
          materialId: 91,
          pageCount: null,
          processingStatus: 'PROCESSING',
          title: 'lecture.pdf',
        })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12']}>
        <AuthProvider
          initialUser={{
            email: 'instructor@example.com',
            id: 7,
            name: '강의자',
            role: 'INSTRUCTOR',
          }}
        >
          <ToastProvider>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<ClassroomDetailPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const contentRegion = await screen.findByRole('region', { name: '자료구조 기초' })
    expect(screen.getByRole('heading', { name: '항목 없음' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '자료구조' })).toBeInTheDocument()
    expect(screen.queryByText('자료구조 강의실')).not.toBeInTheDocument()
    const weekNavigation = screen.getByRole('navigation', { name: '강의실 주차' })
    const firstWeekButton = within(weekNavigation).getByText('자료구조 기초').closest('button')
    const secondWeekButton = within(weekNavigation).getByText('심화').closest('button')
    expect(firstWeekButton).toHaveAttribute('aria-current', 'page')
    expect(firstWeekButton).toHaveClass('grid-cols-[minmax(0,1fr)_72px]')
    expect(secondWeekButton).toHaveClass('grid-cols-[minmax(0,1fr)_72px]')
    expect(within(weekNavigation).queryByText('1', { exact: true })).not.toBeInTheDocument()
    expect(within(weekNavigation).queryByText('2', { exact: true })).not.toBeInTheDocument()
    expect(within(weekNavigation).getByText('8.3 - 8.9')).toBeInTheDocument()
    expect(within(weekNavigation).getByText('8.10 - 8.16')).toBeInTheDocument()
    expect(screen.getByText('2026. 8. 3. - 2026. 11. 15. · 15주차 · 수강생 42명')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '자료구조 기초' })).toBeInTheDocument()
    expect(screen.getAllByText('8.3 - 8.9')).toHaveLength(2)
    expect(screen.getByRole('group', { name: '콘텐츠 유형 필터' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 항목 추가' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '공지 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '시험 추가' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '자료 추가' }))
    expect(screen.getByRole('dialog', { name: '강의자료 업로드' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '강의자료 업로드 닫기' }))
    expect(screen.queryByRole('button', { name: '주차 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '1주차 공개 상태' })).not.toBeInTheDocument()

    const file = new File(['pdf'], 'lecture.pdf', { type: 'application/pdf' })
    fireEvent.dragEnter(contentRegion, { dataTransfer: { files: [file] } })
    fireEvent.drop(contentRegion, { dataTransfer: { files: [file] } })

    await waitFor(() => expect(uploadedValues).not.toBeNull())
    expect(uploadedValues).toEqual({
      classroomId: '12',
      file,
      weekNumber: '1',
    })
    expect(await screen.findByRole('button', { name: /lecture자료/ })).toBeInTheDocument()
    expect(screen.getByText('자료 업로드를 시작했습니다. 처리가 완료되면 학습자 화면에 반영됩니다.')).toBeInTheDocument()
    expect(screen.queryByText(/열람 가능/)).not.toBeInTheDocument()
    expect(weekListCalls).toBeGreaterThanOrEqual(2)
  })

  it('keeps completed classroom materials read-only and available for viewing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        'http://localhost',
      )

      if (url.pathname === '/api/classrooms/12') {
        return success({ ...classroomFixture, status: 'COMPLETED' })
      }
      if (url.pathname === '/api/classrooms/12/weeks') {
        return success({
          items: [{
            ...weekFixture,
            materials: [{
              materialId: 91,
              pageCount: 24,
              processingStatus: 'READY',
              title: '연결 리스트.pdf',
              uploadedAt: '2026-08-02T00:00:00Z',
            }],
          }],
        })
      }
      if (url.pathname === '/api/classrooms/12/notices') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/sessions' && init?.method === 'POST') {
        return success({
          currentPage: 1,
          materialId: 91,
          sessionId: 901,
          status: 'ACTIVE',
          uiActions: [],
        })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<ClassroomDetailPage />} />
              <Route path="/sessions/:sessionId" element={<p>PDF 뷰어</p>} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/종료된 강의실입니다/)).toHaveTextContent(
      '새 항목을 추가하거나 수정할 수 없습니다.',
    )
    expect(screen.queryByText('연결 리스트.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText(/24쪽/)).not.toBeInTheDocument()
    expect(screen.queryByText(/8월 2일 업로드/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('1주차 자료 드롭 영역')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '자료 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공지 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시험 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '1주차 공개 상태' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /연결 리스트자료/ }))
    expect(await screen.findByText('PDF 뷰어')).toBeInTheDocument()
  })

  it('refreshes learner materials when the classroom tab becomes active again', async () => {
    let weekListCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        'http://localhost',
      )

      if (url.pathname === '/api/classrooms/12') return success(classroomFixture)
      if (url.pathname === '/api/classrooms/12/weeks') {
        weekListCalls += 1
        return success({
          items: [{
            ...weekFixture,
            materials: weekListCalls > 1 ? [{
              materialId: 92,
              pageCount: 8,
              processingStatus: 'READY',
              title: 'new-lecture.pdf',
              uploadedAt: '2026-08-10T00:00:00Z',
            }] : [],
          }],
        })
      }
      if (url.pathname === '/api/classrooms/12/notices') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12']}>
        <AuthProvider initialUser={{ email: 'learner@example.com', id: 8, name: '학습자', role: 'LEARNER' }}>
          <ToastProvider>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<ClassroomDetailPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '항목 없음' })).toBeInTheDocument()
    window.dispatchEvent(new Event('focus'))

    expect(await screen.findByRole('button', { name: /new-lecture자료/ })).toBeInTheDocument()
    expect(weekListCalls).toBeGreaterThanOrEqual(2)
  })

  it('shows every classroom week to learners when the backend omits unreleased weeks', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        'http://localhost',
      )

      if (url.pathname === '/api/classrooms/12') {
        return success({ ...classroomFixture, weekCount: 3 })
      }
      if (url.pathname === '/api/classrooms/12/weeks') {
        return success({
          items: [{
            ...weekFixture,
            materials: [{
              materialId: 93,
              pageCount: 12,
              processingStatus: 'READY',
              title: 'published.pdf',
              uploadedAt: '2026-08-10T00:00:00Z',
            }],
          }],
        })
      }
      if (url.pathname === '/api/classrooms/12/notices') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12']}>
        <AuthProvider initialUser={{ email: 'learner@example.com', id: 8, name: '학습자', role: 'LEARNER' }}>
          <ToastProvider>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<ClassroomDetailPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const weekNavigation = await screen.findByRole('navigation', { name: '강의실 주차' })
    expect(within(weekNavigation).getByText('자료구조 기초')).toBeInTheDocument()
    expect(within(weekNavigation).getByText('2주차')).toBeInTheDocument()
    expect(within(weekNavigation).getByText('3주차')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /published자료/ })).toBeInTheDocument()

    fireEvent.click(within(weekNavigation).getByText('3주차'))
    expect(await screen.findByRole('heading', { name: '항목 없음' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '자료 추가' })).not.toBeInTheDocument()
  })
})

const classroomFixture = {
  classroomId: 12,
  color: 'BLUE',
  description: '자료구조 강의실',
  endDate: '2026-11-15',
  instructorName: '박교수',
  inviteCode: '7QK4-MZ2A',
  learnerCount: 42,
  name: '자료구조',
  pendingRequestCount: 0,
  progressRate: 38,
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 15,
}

const weekFixture = {
  materials: [],
  releaseAt: '2026-08-03T09:07:42',
  status: 'PUBLISHED',
  title: '자료구조 기초',
  weekNumber: 1,
}

function success(data: unknown): Response {
  return new Response(
    JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    },
  )
}
