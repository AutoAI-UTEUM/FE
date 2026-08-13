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
      title: FormDataEntryValue | null
      weekNumber: FormDataEntryValue | null
    } | null = null
    let renamedTitle: string | null = null
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
          title: body.get('title'),
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
      if (url.pathname === '/api/materials/91' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { title: string }
        renamedTitle = body.title
        return success({
          createdAt: '2026-08-02T00:00:00Z',
          materialId: 91,
          pageCount: 12,
          processingStatus: 'READY',
          title: body.title,
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

    await screen.findByRole('region', { name: '전체 콘텐츠' })
    expect(screen.getByRole('heading', { name: '항목 없음' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '자료구조' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '강의' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '학습 현황' })).toHaveAttribute('href', '/classrooms/12/analytics')
    expect(screen.getByRole('link', { name: '리포트' })).toHaveAttribute('href', '/classrooms/12/reports')
    expect(screen.getByRole('link', { name: '관리' })).toBeInTheDocument()
    expect(screen.queryByText('자료구조 강의실')).not.toBeInTheDocument()
    const weekNavigation = screen.getByRole('navigation', { name: '강의실 주차' })
    const allItemsButton = within(weekNavigation).getByRole('button', { name: '전체 항목' })
    const firstWeekButton = within(weekNavigation).getByText('자료구조 기초').closest('button')
    const secondWeekButton = within(weekNavigation).getByText('심화').closest('button')
    expect(allItemsButton).toHaveAttribute('aria-current', 'page')
    expect(firstWeekButton).not.toHaveAttribute('aria-current')
    expect(firstWeekButton).toHaveClass('grid-cols-[minmax(0,1fr)_72px]')
    expect(secondWeekButton).toHaveClass('grid-cols-[minmax(0,1fr)_72px]')
    expect(within(weekNavigation).queryByText('1', { exact: true })).not.toBeInTheDocument()
    expect(within(weekNavigation).queryByText('2', { exact: true })).not.toBeInTheDocument()
    expect(within(weekNavigation).getByText('8.3 - 8.9')).toBeInTheDocument()
    expect(within(weekNavigation).getByText('8.10 - 8.16')).toBeInTheDocument()
    expect(screen.getByText('2026. 8. 3. - 2026. 11. 15. · 15주차 · 수강생 42명')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '전체 콘텐츠' })).toBeInTheDocument()
    expect(screen.getAllByText('8.3 - 8.9')).toHaveLength(1)
    expect(screen.getByRole('region', { name: '강의실 통합 콘텐츠' })).toHaveClass('lg:grid-cols-[220px_minmax(0,1fr)]')
    expect(screen.getByRole('group', { name: '콘텐츠 유형 필터' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 항목 추가' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '공지 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '시험 추가' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '자료 추가' }))
    const uploadDialog = screen.getByRole('dialog', { name: '강의자료 업로드' })
    const weekSelect = within(uploadDialog).getByRole('combobox', { name: '주차 선택' })
    expect([...weekSelect.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      '1주차 · 자료구조 기초',
      '2주차 · 심화',
    ])
    expect(weekSelect).toHaveValue('1')
    fireEvent.click(screen.getByRole('button', { name: '강의자료 업로드 닫기' }))
    expect(screen.queryByRole('button', { name: '주차 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '1주차 공개 상태' })).not.toBeInTheDocument()

    fireEvent.click(firstWeekButton!)
    const contentRegion = await screen.findByRole('region', { name: '자료구조 기초' })
    const file = new File(['pdf'], 'lecture.pdf', { type: 'application/pdf' })
    fireEvent.dragEnter(contentRegion, { dataTransfer: { files: [file] } })
    fireEvent.drop(contentRegion, { dataTransfer: { files: [file] } })

    expect(screen.getByRole('dialog', { name: '강의자료 업로드' })).toBeInTheDocument()
    const titleInput = screen.getByRole('textbox', { name: '자료 제목' })
    expect(titleInput).toHaveValue('')
    expect(screen.getByRole('button', { name: '업로드' })).toBeDisabled()
    fireEvent.change(titleInput, { target: { value: 'lecture' } })
    fireEvent.click(screen.getByRole('button', { name: '업로드' }))

    await waitFor(() => expect(uploadedValues).not.toBeNull())
    expect(uploadedValues).toEqual({
      classroomId: '12',
      file,
      title: 'lecture',
      weekNumber: '1',
    })
    expect(await screen.findByRole('button', { name: 'lecture' })).toBeInTheDocument()
    expect(within(contentRegion).getByText('PDF')).toBeInTheDocument()
    expect(within(contentRegion).queryByText('자료', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('자료 업로드를 시작했습니다. 처리가 완료되면 학습자 화면에 반영됩니다.')).toBeInTheDocument()
    expect(screen.getByText('자료 처리가 완료되었습니다. 바로 학습할 수 있습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/열람 가능/)).not.toBeInTheDocument()
    expect(weekListCalls).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('region', { name: '전체 콘텐츠' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '이름 변경' }))
    const renameDialog = screen.getByRole('dialog', { name: '자료 이름 변경' })
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: '자료 제목' }), {
      target: { value: '최적화 강의' },
    })
    fireEvent.click(within(renameDialog).getByRole('button', { name: '변경사항 저장' }))

    await waitFor(() => expect(renamedTitle).toBe('최적화 강의'))
    expect(await screen.findByRole('button', { name: '최적화 강의' })).toBeInTheDocument()
    expect(screen.getByText('자료 이름을 변경했습니다.')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '연결 리스트' }))
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
    expect(screen.getByRole('button', { name: '전체 항목' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: '강의' })).not.toBeInTheDocument()
    window.dispatchEvent(new Event('focus'))

    expect(await screen.findByRole('button', { name: 'new-lecture' })).toBeInTheDocument()
    expect(weekListCalls).toBeGreaterThanOrEqual(2)
  })

  it('uses backend week titles in fixed week number order for learners', async () => {
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
          items: [
            {
              ...weekFixture,
              displayOrder: 2,
              title: '시계열 기본 II',
              weekId: 102,
              weekNumber: 2,
            },
            {
              ...weekFixture,
              displayOrder: 1,
              materials: [{
                materialId: 93,
                pageCount: 12,
                processingStatus: 'READY',
                title: 'published.pdf',
                uploadedAt: '2026-08-10T00:00:00Z',
              }],
              title: '시계열 기본 I',
              weekId: 101,
              weekNumber: 1,
            },
            {
              ...weekFixture,
              displayOrder: 3,
              materials: [{
                materialId: 94,
                pageCount: 20,
                processingStatus: 'READY',
                title: 'scheduled-week.pdf',
                uploadedAt: '2026-08-11T00:00:00Z',
              }],
              status: 'SCHEDULED',
              title: 'Optimization',
              weekId: 103,
              weekNumber: 3,
            },
          ],
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
    const firstWeek = within(weekNavigation).getByText('시계열 기본 I')
    const secondWeek = within(weekNavigation).getByText('시계열 기본 II')
    const thirdWeek = within(weekNavigation).getByText('Optimization')
    expect(firstWeek.compareDocumentPosition(secondWeek) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(secondWeek.compareDocumentPosition(thirdWeek) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(weekNavigation).queryByText('2주차')).not.toBeInTheDocument()
    expect(within(weekNavigation).queryByText('3주차')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'published' })).toBeInTheDocument()

    fireEvent.click(thirdWeek)
    expect(await screen.findByRole('button', { name: 'scheduled-week' })).toBeInTheDocument()
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
