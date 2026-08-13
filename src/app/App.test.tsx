import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import {
  AUTH_IDLE_TIMEOUT_MS,
  AuthProvider,
  type AuthUser,
} from '../features/auth'
import { ToastProvider } from '../shared/ui'
import {
  apiFailure,
  apiSuccess,
  installApiFixtureServer,
} from '../test/apiFixtureServer'
import { AppRoutes } from './AppRoutes'

const authenticatedUser: AuthUser = {
  email: 'learner@example.com',
  name: 'learner',
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

function renderRoute(path: string, initialUser: AuthUser | null = authenticatedUser) {
  return render(
    <AuthProvider initialUser={initialUser}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  )
}

describe('AppRoutes', () => {
  it('uses a 30-minute inactivity timeout', () => {
    expect(AUTH_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
  })

  it('renders the forgot password route', () => {
    renderRoute('/forgot-password', null)

    expect(
      screen.getByRole('heading', { name: '비밀번호 찾기' }),
    ).toBeInTheDocument()
  })

  it('redirects the root route to classrooms', async () => {
    renderRoute('/')

    expect(screen.getByRole('main')).toHaveClass(
      'px-4',
      'py-4',
      'sm:px-6',
      'lg:px-12',
      'lg:py-5',
    )
    expect(
      screen.getByRole('heading', { name: '내 강의실' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('아직 참여 중인 강의실이 없습니다'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: '설정' }),
    ).not.toBeInTheDocument()
  })

  it('renders the integrated session detail route', async () => {
    renderRoute('/sessions/100')

    expect(
      await screen.findByRole('heading', { name: '학습 공간' }),
    ).toBeInTheDocument()
    expect(screen.getByText('시험 대비 요약.pdf 학습 화면입니다.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AI 채팅' })).toBeInTheDocument()
  })

  it('opens the settings page from the profile menu', async () => {
    renderRoute('/')

    const [profileTrigger] = screen.getAllByRole('button', { name: '프로필 메뉴' })
    fireEvent.click(profileTrigger)
    const [settingsMenuItem] = screen.getAllByRole('menuitem', { name: '설정' })
    fireEvent.click(settingsMenuItem)

    expect(
      await screen.findByRole('heading', { name: '설정' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '회원 탈퇴' }))
    expect(
      screen.getByRole('button', { name: '회원 탈퇴 실행' }),
    ).toBeInTheDocument()
  })

  it('shows learner study menus and keeps instructor management menus out', () => {
    renderRoute('/')

    expect(screen.getByRole('link', { name: '강의실' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '내 강의실' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '캘린더' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 노트' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '복습 퀴즈' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '입장 요청' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '학습 현황' })).not.toBeInTheDocument()
  })

  it('shows enrolled classrooms in the learner sidebar', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess({
          items: [{
            classroomId: 12,
            color: 'BLUE',
            currentWeek: 1,
            description: '학습자 강의실',
            endDate: '2026-11-15',
            instructorName: '박교수',
            learnerCount: 20,
            name: '자연어처리 개론',
            pendingRequestCount: 0,
            progressRate: 30,
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 15,
          }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return undefined
    })

    renderRoute('/')

    expect(await screen.findByRole('link', { name: '자연어처리 개론' })).toHaveAttribute(
      'href',
      '/classrooms/12',
    )
    expect(screen.getByRole('button', { name: '알림 0개' })).toBeInTheDocument()
  })

  it('shows an access error for learners on instructor-only routes', () => {
    renderRoute('/classrooms/12/entrance-requests')

    expect(
      screen.getByRole('heading', { name: '접근 권한이 없습니다' }),
    ).toBeInTheDocument()
  })

  it('opens the learner calendar without instructor schedule commands', () => {
    renderRoute('/calendar')

    expect(screen.getByRole('heading', { name: '캘린더' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '일정 추가' })).not.toBeInTheDocument()
  })

  it('renders instructor navigation and management routes', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess({
          items: [{
            classroomId: 12,
            color: 'BLUE',
            description: '자연어처리 수업',
            endDate: '2026-11-15',
            instructorName: '강의자',
            learnerCount: 20,
            name: '자연어처리 개론',
            pendingRequestCount: 0,
            progressRate: 30,
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 15,
          }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return undefined
    })
    renderRoute('/classrooms/12/entrance-requests', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    expect(
      screen.getByRole('heading', { name: '입장 요청' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '강의실' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '자연어처리 개론' })).toHaveAttribute('href', '/classrooms/12')
    expect(screen.getByRole('link', { name: '캘린더' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '학습 현황' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '공지 관리' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '통합 관리' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '입장 요청' })).toHaveAttribute('href', '/entrance-requests')
    expect(screen.queryByRole('link', { name: '자료' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('강의실 선택')).not.toBeInTheDocument()
  })

  it('keeps the classroom workspace header mounted while changing week content', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12') {
        return apiSuccess({
          classroomId: 12,
          color: 'BLUE',
          description: '자료구조 강의실',
          endDate: '2026-11-15',
          instructorName: '강의자',
          learnerCount: 20,
          materialCount: 2,
          name: '자료구조',
          pendingRequestCount: 0,
          progressRate: 30,
          startDate: '2026-08-03',
          status: 'ACTIVE',
          weekCount: 15,
        })
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12/notices') {
        return apiSuccess({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return undefined
    })
    renderRoute('/classrooms/12', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    const heading = await screen.findByRole('heading', { level: 1, name: '자료구조' })
    const weekRail = await screen.findByRole('navigation', { name: '강의실 주차' })
    const secondWeekButton = within(weekRail).getByText('심화 학습').closest('button')
    expect(secondWeekButton).not.toBeNull()
    fireEvent.click(secondWeekButton!)
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: '강의실 주차' })).getByText('심화 학습').closest('button')).toHaveAttribute('aria-current', 'page'))
    const filterGroup = screen.getByRole('group', { name: '콘텐츠 유형 필터' })
    fireEvent.click(within(filterGroup).getByRole('button', { name: '공지' }))

    expect(within(filterGroup).getByRole('button', { name: '공지' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1, name: '자료구조' })).toBe(heading)
  })

  it('loads the instructor report screen from the deployed backend contract', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess({
          items: [
            {
              classroomId: 12,
              color: 'BLUE',
              endDate: '2026-11-15',
              instructorName: '강의자',
              learnerCount: 1,
              name: '자료구조',
              pendingRequestCount: 0,
              progressRate: 30,
              startDate: '2026-08-03',
              status: 'ACTIVE',
              weekCount: 15,
            },
            {
              classroomId: 13,
              color: 'GREEN',
              endDate: '2026-11-15',
              instructorName: '강의자',
              learnerCount: 1,
              name: '알고리즘',
              pendingRequestCount: 0,
              progressRate: 20,
              startDate: '2026-08-03',
              status: 'ACTIVE',
              weekCount: 15,
            },
          ],
          page: 0,
          size: 100,
          totalElements: 2,
          totalPages: 1,
        })
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12/students') {
        return apiSuccess({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/13/students') {
        return apiSuccess({
          items: [{ affiliation: '컴퓨터공학과', email: 'kim@example.com', name: '김학습', studentId: 31 }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return undefined
    })
    renderRoute('/classrooms/12/reports', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    expect(screen.getByRole('heading', { name: '학습 리포트' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '리포트를 생성할 학습자가 없습니다' })).toBeInTheDocument()
    expect(screen.queryByLabelText('강의실 선택')).not.toBeInTheDocument()
    expect(screen.queryByText('0점')).not.toBeInTheDocument()
  })

  it('does not present insufficient report data as a score or definitive stage', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/reports/55') {
        return apiSuccess({
          classroomId: 12,
          criteria: [{
            criterionKey: 'concept_understanding',
            criterionName: '개념 이해도',
            evidenceIds: ['e-1'],
            narrative: '판단할 기록이 더 필요합니다.',
            score: null,
            status: 'INSUFFICIENT_DATA',
            trend: 'STABLE',
          }],
          evidence: [{
            evidenceId: 'e-1',
            occurredAt: '2026-08-05T00:00:00Z',
            publicLabel: '1주차 질문 기록',
            sourceType: 'QA_QUESTION',
          }],
          overallScore: null,
          overallStage: '보완 필요',
          reportId: 55,
          status: 'COMPLETED',
          studentId: 31,
          studentName: '김학습',
        })
      }
      return undefined
    })

    renderRoute('/classrooms/12/students/31/reports/55', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    expect(await screen.findAllByText('관찰 데이터 축적 중')).toHaveLength(2)
    expect(screen.getAllByText('데이터 부족')).toHaveLength(3)
    expect(screen.queryByText('0점')).not.toBeInTheDocument()
    expect(screen.queryByText('보완 필요')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('근거 1개'))
    expect(screen.getByText(/학습 질문/)).toBeInTheDocument()
  })

  it('shows upcoming calendar schedules in the notification panel', async () => {
    renderRoute('/calendar', {
      email: 'instructor@example.com',
      id: 7,
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    fireEvent.change(screen.getByLabelText('일정 이름'), {
      target: { value: '자료 공개 확인' },
    })
    fireEvent.change(screen.getByLabelText('날짜와 시간'), {
      target: { value: '2099-08-03T09:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))

    fireEvent.click(await screen.findByRole('button', { name: '알림 1개' }))
    const notificationPanel = screen.getByRole('dialog', { name: '예정 알림' })
    expect(notificationPanel).toBeInTheDocument()
    expect(notificationPanel).toHaveTextContent('자료 공개 확인')
    expect(
      screen.getByRole('button', { name: '캘린더 열기' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '캘린더 열기' })).not.toHaveTextContent('캘린더 열기')

    fireEvent.click(screen.getByRole('button', { name: '읽음 처리' }))

    expect(notificationPanel).toHaveTextContent('예정된 알림이 없습니다')
    expect(screen.getByRole('button', { name: '알림 0개' })).toBeInTheDocument()
    expect(window.localStorage.getItem('edupilot:read-calendar-events:7')).not.toBeNull()
  })

  it('renders the not found route for unknown paths', () => {
    renderRoute('/missing-page')

    expect(
      screen.getByRole('heading', {
        name: '페이지를 찾을 수 없습니다.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 강의실로' })).toHaveAttribute(
      'href',
      '/classrooms',
    )
  })

  it('redirects protected routes to login when unauthenticated', () => {
    renderRoute('/materials', null)

    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
  })

  it('opens classrooms after login instead of returning to a protected route', async () => {
    renderRoute('/sessions/100', null)

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'learner@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password1' },
    })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '내 강의실' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '학습 공간' })).not.toBeInTheDocument()
  })

  it('shows the session expired login notice', () => {
    renderRoute('/login?reason=session-expired', null)

    expect(screen.getByRole('alert')).toHaveTextContent(
      '세션이 만료되었습니다. 다시 로그인하세요.',
    )
  })

  it('validates login form fields', () => {
    renderRoute('/login', null)

    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('비밀번호를 입력하세요.')).toBeInTheDocument()
  })

  it('keeps the access token in memory only after login (DEC-004)', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    window.localStorage.clear()
    window.sessionStorage.clear()
    render(
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/login']}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>,
    )

    fireEvent.change(await screen.findByLabelText('이메일'), {
      target: { value: 'learner@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password1' },
    })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(
      await screen.findByRole('heading', { name: '내 강의실' }),
    ).toBeInTheDocument()
    expect(screen.getByText('learner')).toBeInTheDocument()
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('restores the session from the refresh cookie on load', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/api/auth/refresh') {
        return apiSuccess({
          accessToken: 'refreshed-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
        })
      }
      return undefined
    })

    render(
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/materials']}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: '자료' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('PDF 업로드')).toBeInTheDocument()
  })

  it('renews the access token once and retries a 401 request', async () => {
    let materialsCalls = 0
    let refreshCalls = 0
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/materials') {
        materialsCalls += 1
        if (materialsCalls === 1) {
          return apiFailure('TOKEN_INVALID', '토큰이 만료되었습니다.', 401)
        }
        return undefined
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/refresh') {
        refreshCalls += 1
        return apiSuccess({
          accessToken: `renewed-token-${refreshCalls}`,
          expiresIn: 3600,
          tokenType: 'Bearer',
        })
      }
      return undefined
    })

    render(
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/materials']}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>,
    )

    expect(await screen.findByText('시험 대비 요약.pdf')).toBeInTheDocument()
    expect(materialsCalls).toBe(2)
    expect(refreshCalls).toBe(2)
  })

  it('maps API validation errors onto login fields', async () => {
    renderRoute('/login', null)

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'locked@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password1' },
    })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(
      await screen.findByText('이메일 또는 비밀번호를 확인하세요.'),
    ).toBeInTheDocument()
  })

  it('validates signup form fields', () => {
    renderRoute('/signup', null)

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(screen.getByText('이름을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('비밀번호를 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('필수 약관에 동의해 주세요.')).toBeInTheDocument()
  })
})
