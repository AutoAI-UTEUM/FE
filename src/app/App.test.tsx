import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import {
  AUTH_IDLE_TIMEOUT_MS,
  AuthProvider,
  type AuthUser,
} from '../features/auth'
import { CLASSROOMS_CHANGED_EVENT } from '../features/classrooms'
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
  it('shows the Uteum brand and personalized learning message on the login screen', async () => {
    renderRoute('/login', null)

    expect(await screen.findAllByText('으뜸')).not.toHaveLength(0)
    expect(await screen.findAllByText('Uteum')).not.toHaveLength(0)
    const intro = screen.getByText(/같은 강의,/)
    expect(intro).toHaveClass('type-auth-intro')
    expect(intro).toHaveTextContent(/같은 강의,\s*나에게 맞춘 학습\.\s*그래서, 으뜸\./)
    expect(screen.getByText('그래서, 으뜸.')).toHaveClass('text-[#5B8DEF]')
    expect(screen.getByText(/이해 속도에 맞춰 설명하고 점검하는/)).toHaveClass('type-auth-description')
    expect(
      screen.queryByText(
        'Ulsan University Tailored Educational User-adapted Module',
      ),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('로그인 · 으뜸'))
  })

  it('uses a 30-minute inactivity timeout', () => {
    expect(AUTH_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
  })

  it('renders the forgot password route', async () => {
    renderRoute('/forgot-password', null)

    expect(
      await screen.findByRole('heading', { name: '비밀번호 찾기' }),
    ).toBeInTheDocument()
  })

  it('redirects the root route to classrooms', async () => {
    renderRoute('/')

    expect(await screen.findByRole('main')).toHaveClass(
      'px-4',
      'py-4',
      'sm:px-6',
      'lg:px-12',
      'lg:py-5',
    )
    expect(screen.getByRole('complementary')).toHaveClass('lg:w-52')
    expect(
      within(screen.getByRole('complementary')).getByText('으뜸'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('complementary')).queryByText('Uteum'),
    ).not.toBeInTheDocument()
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

  it.each([
    ['학습자', { email: 'learner@example.com', name: '학습자', role: 'LEARNER' as const }],
    ['강의자', { email: 'instructor@example.com', name: '강의자', role: 'INSTRUCTOR' as const }],
  ])('%s에게 동일한 일반 페이지 규격을 적용한다', async (_roleLabel, user) => {
    const { container } = renderRoute('/classrooms', user)

    expect(
      await screen.findByRole('heading', { name: '내 강의실' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toHaveClass('lg:w-52')
    expect(screen.getByRole('main')).toHaveClass(
      'px-4',
      'py-4',
      'sm:px-6',
      'lg:px-12',
      'lg:py-5',
    )
    expect(container.querySelector('main > .app-page-frame')).toBeInTheDocument()
    expect(
      container.querySelector('[data-page-container="standard"]'),
    ).toHaveClass('app-page-frame')
  })

  it.each([
    ['학습자', { email: 'learner@example.com', name: '학습자', role: 'LEARNER' as const }],
    ['강의자', { email: 'instructor@example.com', name: '강의자', role: 'INSTRUCTOR' as const }],
  ])('%s에게 동일한 PDF 학습 공간 규격을 적용한다', async (_roleLabel, user) => {
    renderRoute('/sessions/100', user)

    expect(
      await screen.findByRole('heading', { name: '학습 공간' }),
    ).toBeInTheDocument()
    expect(screen.getByText('시험 대비 요약.pdf 학습 화면입니다.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '학습' })).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toHaveClass('lg:w-14')
    expect(screen.getByRole('main')).toHaveClass('lg:h-dvh', 'overflow-hidden', 'p-0')
    expect(await screen.findByRole('region', { name: 'PDF 뷰어' })).toHaveClass(
      'h-full',
      'min-h-0',
      'min-w-0',
    )
  })

  it('redirects the removed session list route to classrooms', async () => {
    renderRoute('/sessions')

    expect(
      await screen.findByRole('heading', { name: '내 강의실' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '학습 세션' }),
    ).not.toBeInTheDocument()
  })

  it('opens the settings dialog from the profile menu', async () => {
    renderRoute('/')

    const [profileTrigger] = screen.getAllByRole('button', { name: '프로필 메뉴' })
    fireEvent.click(profileTrigger)
    const [profileMenu] = screen.getAllByRole('menu')
    expect(within(profileMenu).queryByText('learner@test.com')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '화면 모드' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '도움말 · 피드백' })).not.toBeInTheDocument()
    const [settingsMenuItem] = screen.getAllByRole('menuitem', { name: '설정' })
    fireEvent.click(settingsMenuItem)

    const settingsDialog = await screen.findByRole('dialog', { name: '설정' })
    expect(settingsDialog).toBeInTheDocument()
    expect(settingsDialog.firstElementChild).toHaveClass(
      'h-[min(520px,calc(100dvh-3rem))]',
      'max-w-[560px]',
    )
    expect(settingsDialog.firstElementChild).not.toHaveClass('h-[66dvh]', 'max-h-[66dvh]', 'overflow-y-auto')
    expect(within(settingsDialog).getByRole('button', { name: '피드백' })).toBeInTheDocument()
    fireEvent.click(within(settingsDialog).getByRole('button', { name: '화면 모드' }))
    expect(within(settingsDialog).getByRole('button', { name: '라이트 모드' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '회원 탈퇴' }))
    expect(
      screen.getByRole('button', { name: '회원 탈퇴 실행' }),
    ).toBeInTheDocument()

    fireEvent.click(settingsDialog)
    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
  })

  it('opens development updates as a standalone page from the profile menu', async () => {
    renderRoute('/')

    const [profileTrigger] = screen.getAllByRole('button', { name: '프로필 메뉴' })
    fireEvent.click(profileTrigger)
    const [updatesMenuItem] = screen.getAllByRole('menuitem', { name: '업데이트' })
    fireEvent.click(updatesMenuItem)

    expect(await screen.findByRole('heading', { name: '업데이트' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '개발 파트' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
  })

  it('applies saved profile changes to the shared sidebar profile', async () => {
    renderRoute('/')

    const [profileTrigger] = screen.getAllByRole('button', { name: '프로필 메뉴' })
    fireEvent.click(profileTrigger)
    const [settingsMenuItem] = screen.getAllByRole('menuitem', { name: '설정' })
    fireEvent.click(settingsMenuItem)

    const settingsDialog = await screen.findByRole('dialog', { name: '설정' })
    fireEvent.change(within(settingsDialog).getByLabelText('이름'), {
      target: { value: '김학습' },
    })
    fireEvent.change(within(settingsDialog).getByLabelText('소속'), {
      target: { value: '서울대학교' },
    })
    fireEvent.click(within(settingsDialog).getByRole('button', { name: '저장' }))

    expect(await screen.findByText('설정을 저장했습니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('button', { name: '프로필 메뉴' })
          .some((button) => button.textContent?.includes('김학습')),
      ).toBe(true)
    })
    expect(within(settingsDialog).getByDisplayValue('서울대학교')).toBeInTheDocument()
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

  it('refreshes the sidebar when the classroom list changes', async () => {
    let isDeleted = false
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess({
          items: isDeleted ? [] : [{
            classroomId: 12,
            color: 'BLUE',
            description: '강의자 강의실',
            endDate: '2026-11-15',
            instructorName: '강의자',
            learnerCount: 20,
            name: '삭제할 강의실',
            pendingRequestCount: 0,
            progressRate: 30,
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 15,
          }],
          page: 0,
          size: 100,
          totalElements: isDeleted ? 0 : 1,
          totalPages: isDeleted ? 0 : 1,
        })
      }
      return undefined
    })

    renderRoute('/', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    const sidebar = screen.getByRole('complementary')
    expect(await within(sidebar).findByRole('link', { name: '삭제할 강의실' })).toBeInTheDocument()

    isDeleted = true
    window.dispatchEvent(new Event(CLASSROOMS_CHANGED_EVENT))

    await waitFor(() => {
      expect(within(sidebar).queryByRole('link', { name: '삭제할 강의실' })).not.toBeInTheDocument()
    })
  })

  it('shows an access error for learners on instructor-only routes', () => {
    renderRoute('/classrooms/12/entrance-requests')

    expect(
      screen.getByRole('heading', { name: '접근 권한이 없습니다' }),
    ).toBeInTheDocument()
  })

  it('opens the learner calendar without instructor schedule commands', async () => {
    renderRoute('/calendar')

    expect(await screen.findByRole('heading', { name: '캘린더' })).toBeInTheDocument()
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
      await screen.findByRole('heading', { name: '입장 요청' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toHaveClass('lg:w-52')
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
    const classroomContent = screen.getByRole('region', { name: '강의실 통합 콘텐츠' })
    expect(classroomContent.parentElement?.parentElement).toHaveClass(
      'lg:h-[calc(100dvh-2.5rem)]',
      'lg:overflow-hidden',
    )
    const secondWeekButton = within(weekRail).getByText('심화 학습').closest('button')
    expect(secondWeekButton).not.toBeNull()
    fireEvent.click(secondWeekButton!)
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: '강의실 주차' })).getByText('심화 학습').closest('button')).toHaveAttribute('aria-current', 'page'))
    const filterGroup = screen.getByRole('group', { name: '콘텐츠 유형 필터' })
    fireEvent.click(within(filterGroup).getByRole('button', { name: '공지' }))

    expect(within(filterGroup).getByRole('button', { name: '공지' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1, name: '자료구조' })).toBe(heading)
  })

  it('keeps learning analytics inside a fixed desktop viewport', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms' && url.searchParams.get('size') === '100') {
        return apiSuccess({
          items: [{
            classroomId: 12,
            color: 'BLUE',
            endDate: '2026-08-16',
            instructorName: '강의자',
            learnerCount: 1,
            name: '자료구조',
            pendingRequestCount: 0,
            progressRate: 0,
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 2,
          }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return undefined
    })
    renderRoute('/classrooms/12/analytics', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    const studentPanel = await screen.findByLabelText('수강생별 학습 현황')
    expect(
      studentPanel.closest('[data-page-container="standard"]'),
    ).toHaveClass(
      'lg:h-[calc(100dvh-2.5rem)]',
      'lg:overflow-hidden',
    )
    expect(screen.getByRole('region', { name: '수강생별 학습 현황 목록' })).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-auto',
    )
    expect(screen.queryByText(/수강생 \d+명/)).not.toBeInTheDocument()
  })

  it('opens reports as a separate classroom workspace', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12/students') {
        return apiSuccess({
          items: [
            {
              affiliation: '컴퓨터공학부',
              email: 'learner@example.com',
              name: '김학습',
              studentId: 31,
            },
            {
              affiliation: '산업공학과',
              email: 'excellent@example.com',
              name: '이우수',
              studentId: 32,
            },
          ],
          page: 0,
          size: 100,
          totalElements: 2,
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

    expect(await screen.findByRole('heading', { name: '수강생 리포트' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '리포트' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '학습현황' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '평가 지표' })).toHaveAttribute('href', '/classrooms/12/report-criteria')
    expect(screen.queryByText('분석 대상 학습자')).not.toBeInTheDocument()
    expect(screen.queryByText('학습자를 선택해 새 리포트를 생성하거나 저장된 버전을 확인하세요.')).not.toBeInTheDocument()
    expect(screen.queryByText(/수강생 \d+명/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '김학습 리포트 열기' })).toHaveAttribute('href', '/classrooms/12/students/31/reports')

    fireEvent.change(screen.getByRole('searchbox', { name: '리포트 학습자 검색' }), {
      target: { value: '산업공학과' },
    })
    expect(screen.getByRole('link', { name: '이우수 리포트 열기' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '김학습 리포트 열기' })).not.toBeInTheDocument()
  })

  it('localizes report criteria and hides evidence source codes', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/reports/55') {
        return apiSuccess({
          classroomId: 12,
          criteria: [{
            criterionKey: 'concept_understanding',
            criterionName: 'Concept Understanding',
            evidenceIds: ['evidence-1'],
            narrative: '판단할 기록이 더 필요합니다.',
            score: null,
            status: 'INSUFFICIENT_DATA',
            trend: 'STABLE',
          }],
          evidence: [{
            evidenceId: 'evidence-1',
            metrics: [
              { label: '평균 점수', value: '25.69점' },
              { label: '강점 문항', value: '3개' },
              { label: '보완 문항', value: '5개' },
            ],
            occurredAt: '2026-08-05T08:41:00Z',
            publicLabel: '퀴즈 평가 결과',
            sourceType: 'QUIZ_ASSESSMENT',
          }],
          overallScore: null,
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

    expect(await screen.findByRole('heading', { name: '김학습 리포트' })).toBeInTheDocument()
    expect(screen.getAllByText('관찰 데이터 축적 중')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '개념 이해도' })).toBeInTheDocument()
    expect(screen.queryByText('Concept Understanding')).not.toBeInTheDocument()
    expect(screen.getByText('퀴즈 평가 결과')).toBeInTheDocument()
    expect(screen.getByText('평균 점수')).toBeInTheDocument()
    expect(screen.getByText('25.69점')).toBeInTheDocument()
    expect(screen.getByText('강점 문항')).toBeInTheDocument()
    expect(screen.getByText('3개')).toBeInTheDocument()
    expect(screen.getByText('보완 문항')).toBeInTheDocument()
    expect(screen.getByText('5개')).toBeInTheDocument()
    expect(screen.queryByText('QUIZ_ASSESSMENT')).not.toBeInTheDocument()
    expect(screen.queryByText('근거가 부족한 항목은 점수로 환산하지 않습니다. 추가 학습 기록이 쌓인 뒤 리포트를 다시 생성해 주세요.')).not.toBeInTheDocument()
  })

  it('opens the student report history from the reports workspace', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12/students/31/reports') {
        return apiSuccess({ activeGeneration: null, items: [] })
      }
      if (request.method === 'POST' && url.pathname === '/api/classrooms/12/students/31/reports') {
        return apiSuccess({
          classroomId: 12,
          pollAfterSeconds: 10,
          reportId: 77,
          status: 'PENDING',
          studentId: 31,
        }, 202)
      }
      return undefined
    })

    renderRoute('/classrooms/12/students/31/reports', {
      email: 'instructor@example.com',
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    expect(await screen.findByRole('heading', { name: '학생 리포트' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '새 리포트 생성' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '저장된 버전' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '새 리포트 생성' }))

    const generatingButton = await screen.findByRole('button', { name: '리포트 생성 중' })
    expect(generatingButton).toBeDisabled()
    expect(generatingButton).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('학습 기록을 분석하고 있습니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('창을 닫아도 서버 작업은 계속됩니다. 완료 상태를 주기적으로 확인합니다.')).not.toBeInTheDocument()
  })

  it('shows server notifications and persists read and delete actions', async () => {
    const notification = {
      body: '3주차 공지를 확인해 주세요.',
      createdAt: '2026-08-20T03:00:00Z',
      link: { classroomId: 12, noticeId: 70 },
      notificationId: 100,
      readAt: null as string | null,
      title: '중간고사 안내',
      type: 'NOTICE_PUBLISHED',
    }
    const requests: string[] = []
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      if (!url.pathname.startsWith('/api/users/me/notifications')) return undefined
      requests.push(`${request.method} ${url.pathname}`)
      if (request.method === 'GET') {
        return apiSuccess({
          items: [notification],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        })
      }
      if (request.method === 'PATCH') {
        notification.readAt = '2026-08-20T03:01:00Z'
        return apiSuccess(notification)
      }
      if (request.method === 'DELETE') return apiSuccess(null)
      return undefined
    })

    renderRoute('/', {
      email: 'instructor@example.com',
      id: 7,
      name: '강의자',
      role: 'INSTRUCTOR',
    })

    fireEvent.click(await screen.findByRole('button', { name: '알림 1개' }))
    const notificationPanel = screen.getByRole('dialog', { name: '알림' })
    expect(notificationPanel).toBeInTheDocument()
    expect(notificationPanel).toHaveTextContent('중간고사 안내')
    expect(notificationPanel).toHaveTextContent('3주차 공지를 확인해 주세요.')
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '모두 읽음' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: '모두 읽음' }))

    expect(await screen.findByRole('button', { name: '알림 0개' })).toBeInTheDocument()
    expect(screen.queryByLabelText('읽지 않음')).not.toBeInTheDocument()
    expect(requests).toContain('PATCH /api/users/me/notifications/100/read')

    fireEvent.click(screen.getByRole('button', { name: '중간고사 안내 알림 삭제' }))

    expect(await screen.findByText('새로운 알림이 없습니다')).toBeInTheDocument()
    expect(requests).toContain('DELETE /api/users/me/notifications/100')
  })

  it('renders the not found route for unknown paths', async () => {
    renderRoute('/missing-page')

    expect(
      await screen.findByRole('heading', {
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

  it('validates signup form fields', async () => {
    renderRoute('/signup', null)

    fireEvent.click(await screen.findByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(screen.getByText('이름을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('이메일을 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('비밀번호를 입력하세요.')).toBeInTheDocument()
    expect(screen.getByText('필수 약관에 동의해 주세요.')).toBeInTheDocument()
  })
})
