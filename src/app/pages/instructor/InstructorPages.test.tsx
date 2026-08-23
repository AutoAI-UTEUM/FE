import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import { InstructorCalendarPage } from './InstructorCalendarPage'
import { InstructorClassroomsPage } from './InstructorClassroomsPage'
import { InstructorLearningStatusPage } from './InstructorLearningStatusPage'
import { InstructorNoticesPage } from './InstructorNoticesPage'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderCalendar() {
  return render(
    <AuthProvider
      initialUser={{
        email: 'instructor@example.com',
        id: 7,
        name: '강의자',
        role: 'INSTRUCTOR',
      }}
    >
      <ToastProvider><InstructorCalendarPage /></ToastProvider>
    </AuthProvider>,
  )
}

function renderInstructorPage(page: ReactNode, initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
        <ToastProvider>{page}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function renderInstructorRoute(page: ReactNode, path: string, routePath: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
        <ToastProvider><Routes><Route element={page} path={routePath} /></Routes></ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}


function stubNoticesApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost')
    const envelope = (data: unknown) =>
      new Response(JSON.stringify({ data, message: 'ok', success: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })

    if (url.pathname.includes('/notices')) {
      return envelope({
        items: [
          {
            classroomId: 1,
            content: '중간고사 범위는 1~4주차입니다.',
            createdAt: '2026-07-26T00:00:00Z',
            noticeId: 11,
            publishedAt: '2026-07-26T00:00:00Z',
            title: '중간고사 범위 안내',
            updatedAt: '2026-07-26T00:00:00Z',
          },
        ],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      })
    }
    if (url.pathname === '/api/classrooms/1') {
      return envelope({
        classroomId: 1,
        color: 'BLUE',
        endDate: '2026-11-15',
        instructorName: '박교수',
        learnerCount: 38,
        name: '자료구조',
        pendingRequestCount: 0,
        progressRate: 0,
        startDate: '2026-08-03',
        status: 'ACTIVE',
        weekCount: 15,
      })
    }
    return envelope(null)
  })
}

function stubClassroomsApi(status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE') {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    const envelope = (data: unknown) =>
      new Response(JSON.stringify({ data, message: 'ok', success: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })

    if (url.includes('/analytics')) return envelope({
      aiQuestionCountLast7Days: 17,
      averageProgressRate: 38,
      inactiveLearnerCountLast7Days: 4,
      lastUpdatedAt: '2026-08-04T06:00:00Z',
      learnerCount: 42,
      materials: [],
      questionsByPage: [
        { materialId: 10, pageNumber: 3, questionCount: 8 },
        { materialId: 10, pageNumber: 7, questionCount: 4 },
      ],
    })
    if (url.includes('/invite-code')) return envelope({ inviteCode: '7QK4-MZ2A' })
    if (url.includes('/students')) return envelope({
      items: [{
        aiQuestionCountLast7Days: 6,
        averageProgressRate: 64,
        email: 'learner@example.com',
        joinedAt: '2026-08-01T00:00:00Z',
        lastActiveAt: new Date().toISOString(),
        name: '김학습',
        status: 'ACTIVE',
        studentId: 9,
      }],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    })
    if (url.includes('/weeks')) return envelope({ items: [] })
    if (url.includes('/api/classrooms')) {
      return envelope({
        items: [
          {
            averageProgressRate: 38,
            classroomId: 12,
            color: 'BLUE',
            endDate: '2026-11-15',
            instructorName: '박교수',
            learnerCount: 42,
            name: '자료구조',
            pendingRequestCount: 0,
            progressRate: 0,
            startDate: '2026-08-03',
            status,
            weekCount: 15,
          },
        ],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      })
    }
    return envelope(null)
  })
}

function stubClassroomCreationApi() {
  let createClassroomRequests = 0
  const weekBodies: Array<{ title: string; weekNumber: number }> = []
  const weekNumbers: number[] = []
  let activeWeekRequests = 0
  let maxActiveWeekRequests = 0

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost')
    const method = input instanceof Request ? input.method : init?.method ?? 'GET'
    const envelope = (data: unknown) =>
      new Response(JSON.stringify({ data, message: 'ok', success: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })

    if (method === 'GET' && url.pathname === '/api/classrooms') {
      return envelope({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
    }
    if (method === 'POST' && url.pathname === '/api/classrooms') {
      createClassroomRequests += 1
      return envelope({
        classroomId: 12,
        color: 'BLUE',
        endDate: '2026-11-15',
        instructorName: '강의자',
        learnerCount: 0,
        name: '자료구조',
        pendingRequestCount: 0,
        progressRate: 0,
        startDate: '2026-08-03',
        status: 'ACTIVE',
        weekCount: 15,
      })
    }
    if (method === 'POST' && url.pathname === '/api/classrooms/12/weeks') {
      const body = JSON.parse(String(input instanceof Request ? await input.clone().text() : init?.body)) as { title: string; weekNumber: number }
      activeWeekRequests += 1
      maxActiveWeekRequests = Math.max(maxActiveWeekRequests, activeWeekRequests)
      weekBodies.push(body)
      weekNumbers.push(body.weekNumber)
      await new Promise((resolve) => setTimeout(resolve, 1))
      activeWeekRequests -= 1
      return envelope({
        displayOrder: body.weekNumber,
        materials: [],
        releaseAt: null,
        status: 'PUBLISHED',
        title: body.title,
        weekId: body.weekNumber,
        weekNumber: body.weekNumber,
      })
    }
    return envelope(null)
  })

  return {
    getCreateClassroomRequests: () => createClassroomRequests,
    getMaxActiveWeekRequests: () => maxActiveWeekRequests,
    weekBodies,
    weekNumbers,
  }
}

function stubCalendarApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const method = input instanceof Request ? input.method : init?.method ?? 'GET'
    const envelope = (data: unknown) => new Response(
      JSON.stringify({ data, message: 'ok', success: true }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 },
    )
    if (method === 'GET' && url.includes('/api/users/me/schedule?')) return envelope({ items: [] })
    if (method === 'POST' && url.endsWith('/api/users/me/schedule')) {
      return envelope({
        endsAt: '2099-08-03T09:00:00.000Z',
        hasTime: true,
        kind: 'PERSONAL',
        scheduleId: 'personal-1',
        startsAt: '2099-08-03T09:00:00.000Z',
        title: '중간고사 범위 공지',
      })
    }
    if (method === 'DELETE' && url.endsWith('/api/users/me/schedule/personal-1')) return envelope(null)
    return envelope(null)
  })
}

describe('instructor pages', () => {
  it('derives the classroom end date from its start date and week count', () => {
    renderInstructorPage(<InstructorClassroomsPage />)

    expect(
      screen.getAllByRole('button', { name: '강의실 만들기' }),
    ).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '강의실 만들기' }))

    const dialog = screen.getByRole('dialog', { name: '강의실 만들기' })
    const submitButton = screen.getByRole('button', { name: '만들기' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).queryByText('학기')).not.toBeInTheDocument()
    expect(within(dialog).getByText('15주')).toBeInTheDocument()
    expect(screen.queryByText('운영 중 0개')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d{4}년 \d학기/)).not.toBeInTheDocument()
    expect(submitButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('강의실 이름'), {
      target: { value: '자료구조' },
    })
    fireEvent.change(screen.getByLabelText('수업 시작일'), {
      target: { value: '2026-08-03' },
    })
    expect(screen.getByText('2026-11-15까지 · 15개 주차가 자동 생성됩니다.')).toBeInTheDocument()
    expect(submitButton).toBeEnabled()

    expect(dialog).toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)
  })

  it('requires a classroom name and start date before creation', () => {
    renderInstructorPage(<InstructorClassroomsPage />)

    fireEvent.click(screen.getByRole('button', { name: '강의실 만들기' }))
    fireEvent.change(screen.getByLabelText('강의실 이름'), {
      target: { value: '자료구조' },
    })
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('수업 시작일'), {
      target: { value: '2026-08-10' },
    })
    expect(screen.getByRole('button', { name: '만들기' })).toBeEnabled()
  })

  it('creates classroom weeks sequentially from week one', async () => {
    const requests = stubClassroomCreationApi()
    renderInstructorPage(<InstructorClassroomsPage />)

    fireEvent.click(screen.getByRole('button', { name: '강의실 만들기' }))
    fireEvent.change(screen.getByLabelText('강의실 이름'), { target: { value: '자료구조' } })
    fireEvent.change(screen.getByLabelText('수업 시작일'), { target: { value: '2026-08-03' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await screen.findByText('15개 주차와 강의실을 만들었습니다.')
    expect(requests.weekNumbers).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
    expect(requests.weekBodies.every((body) => !('releaseAt' in body))).toBe(true)
    expect(requests.getMaxActiveWeekRequests()).toBe(1)
  })

  it('creates only one classroom when the submit button is double-clicked', async () => {
    const requests = stubClassroomCreationApi()
    renderInstructorPage(<InstructorClassroomsPage />)

    fireEvent.click(screen.getByRole('button', { name: '강의실 만들기' }))
    fireEvent.change(screen.getByLabelText('강의실 이름'), { target: { value: '중복 방지 강의실' } })
    fireEvent.change(screen.getByLabelText('수업 시작일'), { target: { value: '2026-08-03' } })

    const submitButton = screen.getByRole('button', { name: '만들기' })
    fireEvent.click(submitButton)
    fireEvent.click(submitButton)

    expect(screen.getByRole('button', { name: '만드는 중' })).toBeDisabled()
    await screen.findByText('15개 주차와 강의실을 만들었습니다.')
    expect(requests.getCreateClassroomRequests()).toBe(1)
  })

  it('matches the classroom search controls from the instructor design', () => {
    renderInstructorPage(<InstructorClassroomsPage />)

    fireEvent.click(screen.getByRole('button', { name: '강의실 검색' }))

    expect(
      screen.getByRole('dialog', { name: '강의실 검색' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '검색 닫기' })).toHaveTextContent(
      'esc',
    )
    expect(screen.queryByText('⌘K로 어디서든 열기')).not.toBeInTheDocument()
  })

  it('uses the simplified classroom card actions', async () => {
    const fetchMock = stubClassroomsApi()
    renderInstructorPage(<InstructorClassroomsPage />)

    const classroomLink = await screen.findByRole('link', { name: '자료구조' })
    const copyButton = screen.getByRole('button', { name: '자료구조 초대 코드 복사' })
    const regenerateButton = screen.getByRole('button', { name: '자료구조 초대 코드 재발급' })

    expect(classroomLink).toHaveClass('type-card-title')
    expect(screen.getByText('7QK4-MZ2A')).toHaveClass('type-section-title')
    expect(copyButton).toHaveClass('type-compact-action')
    expect(regenerateButton).toHaveClass('type-compact-action')
    expect(copyButton.querySelector('svg')).not.toBeInTheDocument()
    expect(regenerateButton.querySelector('svg')).not.toBeInTheDocument()
    expect(screen.getByText('38%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '자료 관리' })).toHaveAttribute('href', '/classrooms/12')
    expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/classrooms/12/settings')
    expect(screen.getByRole('link', { name: '학습현황·리포트' })).toHaveAttribute('href', '/classrooms/12/analytics')

    fetchMock.mockRestore()
  })

  it('keeps classroom settings available after the classroom is completed', async () => {
    const fetchMock = stubClassroomsApi('COMPLETED')
    renderInstructorPage(<InstructorClassroomsPage />)

    await screen.findByRole('link', { name: '자료구조' })

    expect(screen.getByRole('link', { name: '보관된 자료 보기' })).toHaveAttribute('href', '/classrooms/12')
    expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/classrooms/12/settings')
    expect(screen.queryByRole('link', { name: '학습현황·리포트' })).not.toBeInTheDocument()

    fetchMock.mockRestore()
  })

  it('offers edit and takedown controls for each notice', async () => {
    const fetchMock = stubNoticesApi()
    renderInstructorRoute(<InstructorNoticesPage />, '/classrooms/1/announcements', '/classrooms/:classroomId/announcements')

    fireEvent.click(await screen.findByRole('button', { name: /중간고사 범위 안내/ }))
    expect(screen.getByRole('heading', { name: '공지 편집' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('중간고사 범위 안내')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('asks for confirmation before taking a notice down', async () => {
    const fetchMock = stubNoticesApi()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderInstructorRoute(<InstructorNoticesPage />, '/classrooms/1/announcements', '/classrooms/:classroomId/announcements')

    fireEvent.click(await screen.findByRole('button', { name: '공지 삭제' }))

    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
    fetchMock.mockRestore()
  })

  it('switches between calendar views', () => {
    renderCalendar()

    fireEvent.click(screen.getByRole('button', { name: '목록' }))
    expect(
      screen.getByRole('heading', { name: '예정된 일정이 없습니다' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '주' }))
    expect(screen.queryByText('예정된 일정이 없습니다')).not.toBeInTheDocument()
  })

  it('moves directly to a selected year and month', () => {
    renderCalendar()
    const targetYear = new Date().getFullYear() + 2

    fireEvent.click(
      screen.getByRole('button', { name: '연도와 월 선택' }),
    )
    expect(
      screen.getByRole('dialog', { name: '연도와 월 선택' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('연도 선택'), {
      target: { value: String(targetYear) },
    })
    fireEvent.click(screen.getByRole('button', { name: '12월' }))

    expect(
      screen.getByRole('button', { name: '연도와 월 선택' }),
    ).toHaveTextContent(`${targetYear}년 12월`)
    expect(
      screen.queryByRole('dialog', { name: '연도와 월 선택' }),
    ).not.toBeInTheDocument()
  })

  it('moves between months with the calendar wheel and returns to this month', () => {
    renderCalendar()
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const monthCalendar = screen.getByRole('region', { name: '월간 캘린더' })

    fireEvent.wheel(monthCalendar, { deltaX: 0, deltaY: 100 })

    expect(screen.getByRole('button', { name: '연도와 월 선택' })).toHaveTextContent(
      `${nextMonth.getFullYear()}년 ${nextMonth.getMonth() + 1}월`,
    )
    expect(screen.getByRole('button', { name: '이번 달' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '이번 달' }))

    expect(screen.getByRole('button', { name: '연도와 월 선택' })).toHaveTextContent(
      `${now.getFullYear()}년 ${now.getMonth() + 1}월`,
    )
    expect(screen.queryByRole('button', { name: '이번 달' })).not.toBeInTheDocument()
  })

  it('places the schedule action after the view controls in a fixed-height layout', () => {
    renderCalendar()
    const viewControls = screen.getByRole('group', { name: '캘린더 보기' })
    const addButton = screen.getByRole('button', { name: '일정 추가' })
    const page = screen.getByRole('heading', { name: '캘린더' }).closest('.w-full')

    expect(viewControls.nextElementSibling).toBe(addButton)
    expect(page).toHaveClass('lg:h-[calc(100dvh-2.5rem)]', 'lg:overflow-hidden')
    expect(screen.getByRole('region', { name: '월간 캘린더' })).toHaveClass('lg:min-h-0')
  })

  it('uses distinct colors for Saturday and Sunday dates', () => {
    renderCalendar()

    fireEvent.click(screen.getByRole('button', { name: '연도와 월 선택' }))
    fireEvent.change(screen.getByLabelText('연도 선택'), {
      target: { value: '2027' },
    })
    fireEvent.click(screen.getByRole('button', { name: '8월' }))

    const saturday = screen.getByLabelText('2027년 8월 14일 토요일 일정 0개')
    const sunday = screen.getByLabelText('2027년 8월 15일 일요일 일정 0개')
    expect(within(saturday).getByText('14')).toHaveClass('text-sky-700')
    expect(within(sunday).getByText('15')).toHaveClass('text-rose-600')
  })

  it('adds and removes a calendar schedule through the personal schedule API', async () => {
    const fetchMock = stubCalendarApi()
    renderCalendar()

    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    expect(
      screen.getByRole('dialog', { name: '일정 추가' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('일정 이름'), {
      target: { value: '중간고사 범위 공지' },
    })
    fireEvent.change(screen.getByLabelText('날짜와 시간'), {
      target: { value: '2099-08-03T09:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 추가' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '목록' }))
    const scheduleItem = screen.getByRole('button', { name: /중간고사 범위 공지/ })
    expect(scheduleItem).not.toHaveTextContent(/오전|오후|\d{1,2}:\d{2}/)
    fireEvent.click(scheduleItem)
    expect(
      screen.getByRole('dialog', { name: '중간고사 범위 공지' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '일정 삭제' }))
    await waitFor(() => expect(screen.queryByText('중간고사 범위 공지')).not.toBeInTheDocument())
    expect(window.localStorage.length).toBe(0)
    fetchMock.mockRestore()
  })

  it('supports all-day and ranged calendar schedules', () => {
    renderCalendar()

    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    fireEvent.click(screen.getByRole('switch', { name: '기간' }))
    fireEvent.click(screen.getByRole('switch', { name: '시간' }))

    expect(screen.getByLabelText('시작')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('종료일')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('switch', { name: '기간' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: '시간' })).toHaveAttribute('aria-checked', 'false')
  })

  it('opens the learning status for the classroom selected in the URL', async () => {
    const fetchMock = stubClassroomsApi()
    renderInstructorPage(
      <InstructorLearningStatusPage />,
      ['/classrooms/12/analytics'],
    )

    expect(await screen.findByRole('link', { name: '학습현황·리포트' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: '리포트' })).not.toBeInTheDocument()
    expect(screen.queryByText('관찰 데이터 축적 중')).not.toBeInTheDocument()
    expect(await screen.findByText('최근 7일 AI 질문')).toBeInTheDocument()
    expect(screen.getByText('6건')).toBeInTheDocument()
    expect(screen.queryByLabelText('학습 현황 요약')).not.toBeInTheDocument()
    expect(screen.getByText('페이지별 질문 수')).toBeInTheDocument()
    expect(screen.getByText('p.3')).toBeInTheDocument()
    expect(screen.getByText('질문 8건')).toBeInTheDocument()
    expect(screen.getByLabelText('3쪽 질문 8건').firstElementChild).toHaveStyle({ width: '100%' })
    expect(screen.getByLabelText('7쪽 질문 4건').firstElementChild).toHaveStyle({ width: '50%' })
    expect(screen.getByText('수강생별 학습 현황')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '김학습 리포트' })).toHaveAttribute('href', '/classrooms/12/students/9/reports')
    expect(screen.getByLabelText('수강생별 학습 현황').parentElement).toHaveClass('xl:grid-cols-2', '2xl:grid-cols-[minmax(260px,0.9fr)_minmax(240px,0.75fr)_minmax(680px,1.35fr)]')
    expect(screen.getByLabelText('수강생별 학습 현황')).toHaveClass('xl:col-span-2', '2xl:col-span-1')
    expect(screen.getByText('64%')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '리마인더 보내기' }),
    ).not.toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('starts a new notice from the notice list', async () => {
    const fetchMock = stubNoticesApi()
    renderInstructorRoute(<InstructorNoticesPage />, '/classrooms/1/announcements', '/classrooms/:classroomId/announcements')

    fireEvent.click(await screen.findByRole('button', { name: '새 공지' }))
    expect(screen.getByRole('heading', { name: '공지 작성' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('공지 제목을 입력하세요')).toHaveValue('')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fetchMock.mockRestore()
  })
})
