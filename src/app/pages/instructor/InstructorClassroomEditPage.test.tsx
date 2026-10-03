import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider, useAuth, type AuthUser } from '../../../features/auth'
import { CLASSROOMS_CHANGED_EVENT } from '../../../features/classrooms'
import { ToastProvider } from '../../../shared/ui'
import { InstructorClassroomEditPage } from './InstructorClassroomEditPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('InstructorClassroomEditPage', () => {
  it('renders the design sections with API-backed classroom data', async () => {
    const permanentDeleteBodies: unknown[] = []
    let completionCalls = 0
    const classroomChanged = new Promise<Event>((resolve) => {
      window.addEventListener(CLASSROOMS_CHANGED_EVENT, resolve, { once: true })
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        'http://localhost',
      )
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (url.pathname === '/api/classrooms/12' && method === 'DELETE') {
        completionCalls += 1
        return success(null)
      }
      if (url.pathname === '/api/classrooms/12') {
        return success(classroomFixture)
      }
      if (url.pathname === '/api/classrooms/12/weeks') {
        return success({
          items: [
            {
              displayOrder: 1,
              materials: [],
              releaseAt: '2026-08-03T00:00:00Z',
              status: 'PUBLISHED',
              title: '1주차',
              weekId: 101,
              weekNumber: 1,
            },
          ],
        })
      }
      if (url.pathname === '/api/classrooms/12/students') {
        return success({
          items: [
            {
              affiliation: '서울대학교',
              email: 'learner@example.com',
              joinedAt: '2026-08-02T01:00:00Z',
              name: '김학습',
              status: 'ACTIVE',
              studentId: 9,
            },
          ],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      if (url.pathname === '/api/classrooms/12/invite-code') {
        return success({ inviteCode: '7QK4-MZ2A' })
      }
      if (url.pathname === '/api/classrooms/12/permanent' && method === 'DELETE') {
        const body = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body))
        permanentDeleteBodies.push(body)
        return success(null)
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12/edit']}>
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
              <Route
                path="/classrooms/:classroomId/edit"
                element={<InstructorClassroomEditPage />}
              />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: '기본 정보' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '주차 구성' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '주차 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '주차 수 줄이기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '주차 수 늘리기' })).not.toBeInTheDocument()
    expect(screen.queryByText(/6점 핸들을 끌어/)).not.toBeInTheDocument()
    expect(screen.queryByText('전체 15주')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('자료구조')).toBeInTheDocument()
    expect(screen.getByLabelText('1주차 항목')).toHaveTextContent('1주차')
    expect(screen.getByLabelText('15주차 항목')).toHaveTextContent('15주차')
    expect(screen.getByText('7QK4-MZ2A')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '학습현황' })).toHaveAttribute('href', '/classrooms/12/analytics')
    expect(screen.queryByRole('link', { name: '평가 지표' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '리포트' })).not.toBeInTheDocument()
    expect(screen.queryByText('2026. 8. 3. - 2026. 11. 15. · 수강생 1명')).not.toBeInTheDocument()
    const basicSection = screen.getByRole('heading', { name: '기본 정보' }).closest('section')
    const dangerSection = screen.getByRole('heading', { name: '위험 구역' }).closest('section')
    expect(dangerSection).toHaveClass('shrink-0')
    expect(dangerSection?.parentElement).toBe(basicSection?.parentElement)
    expect(dangerSection?.parentElement).toHaveClass('flex', 'flex-col')
    expect(document.getElementById('classroom-edit-form')).toHaveClass('xl:flex-1', 'flex-col', 'xl:overflow-hidden')
    expect(screen.getByRole('link', { name: '관리' })).toHaveAttribute('aria-current', 'page')
    expect(
      document
        .getElementById('classroom-edit-form')
        ?.closest('[data-page-container="standard"]'),
    ).toHaveClass(
      'flex',
      'lg:min-h-[calc(100dvh-2.5rem)]',
      'gap-4',
      'xl:h-[calc(100dvh-2.5rem)]',
      'xl:overflow-hidden',
    )

    expect(screen.queryByRole('button', { name: '1주차 공개' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1주차 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1주차 비공개' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1주차 휴강' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1주차 삭제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1주차 순서 이동' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '1주차 이름' })).toHaveValue('1주차')
    expect(screen.queryByRole('button', { name: '위로 이동' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '아래로 이동' })).not.toBeInTheDocument()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '강의실 종료' }))
    expect(confirmSpy).toHaveBeenCalledWith(
      '강의실 운영을 종료할까요? 종료 후에는 새 자료 업로드와 학습자 추가가 불가능하며, 기존 자료와 학습 기록만 확인할 수 있습니다.',
    )
    expect(completionCalls).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: '강의실 삭제' }))
    expect(screen.getByRole('heading', { name: '강의실 영구 삭제' })).toBeInTheDocument()
    expect(screen.getByText('강의실과 시험 등 소속 데이터가 영구 삭제됩니다. 학생 개인 학습 기록 (자료·세션·진도)은 유지됩니다.')).toBeInTheDocument()
    const deleteButton = screen.getByRole('button', { name: '영구 삭제' })
    expect(deleteButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/확인을 위해/), { target: { value: '자료구조' } })
    expect(deleteButton).toBeEnabled()
    fireEvent.click(deleteButton)
    await waitFor(() => expect(permanentDeleteBodies).toEqual([{ confirmName: '자료구조' }]))
    await expect(classroomChanged).resolves.toHaveProperty('type', CLASSROOMS_CHANGED_EVENT)
  })

  it('saves changed week names only after the settings form is submitted', async () => {
    const weekUpdateBodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (url.pathname === '/api/classrooms/12') return success(classroomFixture)
      if (url.pathname === '/api/classrooms/12/weeks' && method === 'GET') {
        return success({
          items: [{
            displayOrder: 1,
            materials: [],
            status: 'PUBLISHED',
            title: '1주차',
            weekId: 101,
            weekNumber: 1,
          }],
        })
      }
      if (url.pathname === '/api/classrooms/12/weeks/1' && method === 'PATCH') {
        const body = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body))
        weekUpdateBodies.push(body)
        return success({
          displayOrder: 1,
          materials: [],
          status: 'PUBLISHED',
          title: body.title,
          weekId: 101,
          weekNumber: 1,
        })
      }
      if (url.pathname === '/api/classrooms/12/invite-code') return success({ inviteCode: '7QK4-MZ2A' })
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12/edit']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route path="/classrooms/:classroomId/edit" element={<InstructorClassroomEditPage />} />
              <Route path="/classrooms/:classroomId" element={<p>강의실</p>} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const weekTitleInput = await screen.findByRole('textbox', { name: '1주차 이름' })
    fireEvent.change(weekTitleInput, { target: { value: '오리엔테이션' } })
    expect(weekUpdateBodies).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))

    await waitFor(() => expect(weekUpdateBodies).toEqual([{ title: '오리엔테이션' }]))
  })

  it('disables completion when the classroom is already completed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms/12') return success({ ...classroomFixture, status: 'COMPLETED' })
      if (url.pathname === '/api/classrooms/12/weeks') return success({ items: [] })
      if (url.pathname === '/api/classrooms/12/students') return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      if (url.pathname === '/api/classrooms/12/invite-code') return success({ inviteCode: '7QK4-MZ2A' })
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12/edit']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route path="/classrooms/:classroomId/edit" element={<InstructorClassroomEditPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const completeButton = await screen.findByRole('button', { name: '강의실 종료' })
    expect(completeButton).toBeDisabled()
    expect(completeButton).toHaveAttribute('title', '종료된 강의실은 다시 활성화할 수 없습니다.')
  })

  it('keeps an empty date recoverable and calculates year-end and leap-year dates', async () => {
    mockReadApis({ classroom: { ...classroomFixture, startDate: '2026-12-29', weekCount: 2 }, weeks: createWeeks(2) })
    renderEditor()

    const dateInput = await screen.findByLabelText('수업 시작일')
    expect(document.querySelector('output')).toHaveTextContent('2027-01-11')

    fireEvent.change(dateInput, { target: { value: '' } })
    expect(document.querySelector('output')).toHaveTextContent('')
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()

    fireEvent.change(dateInput, { target: { value: '2024-02-26' } })
    expect(document.querySelector('output')).toHaveTextContent('2024-03-10')
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeEnabled()
  })

  it('rejects whitespace-only classroom and week names without sending writes', async () => {
    let writeCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (method !== 'GET') writeCalls += 1
      if (pathname === '/api/classrooms/12') return success({ ...classroomFixture, endDate: '2026-08-09', weekCount: 1 })
      if (pathname.endsWith('/weeks')) return success({ items: createWeeks(1) })
      if (pathname.endsWith('/invite-code')) return success({ inviteCode: '7QK4-MZ2A' })
      return new Response(null, { status: 404 })
    })
    renderEditor()

    const nameInput = await screen.findByLabelText('강의실 이름')
    const weekInput = screen.getByRole('textbox', { name: '1주차 이름' })
    fireEvent.change(nameInput, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()
    fireEvent.change(nameInput, { target: { value: '자료구조' } })
    fireEvent.change(weekInput, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()
    fireEvent.submit(document.getElementById('classroom-edit-form') as HTMLFormElement)
    expect(writeCalls).toBe(0)
  })

  it.each([0, 53])('rejects an API week count outside 1..52 (%s)', async (weekCount) => {
    mockReadApis({ classroom: { ...classroomFixture, weekCount }, weeks: [] })
    renderEditor()

    expect(await screen.findByRole('heading', { name: '강의실을 불러오지 못했습니다' })).toBeInTheDocument()
    expect(screen.getByText('주차 수는 1주 이상 52주 이하여야 합니다.')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('자료구조')).not.toBeInTheDocument()
  })

  it('repairs a reversed stored period and does not send week updates after classroom save failure', async () => {
    const weekPatchBodies: unknown[] = []
    const classroomPatchBodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname === '/api/classrooms/12' && method === 'GET') {
        return success({ ...classroomFixture, endDate: '2026-07-01' })
      }
      if (pathname === '/api/classrooms/12/weeks' && method === 'GET') return success({ items: createWeeks(1) })
      if (pathname === '/api/classrooms/12/invite-code') return success({ inviteCode: '7QK4-MZ2A' })
      if (pathname === '/api/classrooms/12' && method === 'PATCH') {
        classroomPatchBodies.push(await requestBody(input, init))
        return failure(500, '강의실 저장 실패')
      }
      if (pathname === '/api/classrooms/12/weeks/1' && method === 'PATCH') {
        weekPatchBodies.push(await requestBody(input, init))
        return success(createWeeks(1)[0])
      }
      return new Response(null, { status: 404 })
    })
    renderEditor()

    fireEvent.change(await screen.findByLabelText('강의실 이름'), { target: { value: '자료구조 심화' } })
    fireEvent.change(screen.getByRole('textbox', { name: '1주차 이름' }), { target: { value: '오리엔테이션' } })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))

    await screen.findByText('강의실 저장 실패')
    expect(classroomPatchBodies).toEqual([{ endDate: '2026-11-15', name: '자료구조 심화' }])
    expect(weekPatchBodies).toEqual([])
    expect(screen.getByDisplayValue('자료구조 심화')).toBeInTheDocument()
    expect(screen.getByDisplayValue('오리엔테이션')).toBeInTheDocument()
  })

  it.each([390, 1440])('supports keyboard date recovery and retries only failed writes at %spx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    window.dispatchEvent(new Event('resize'))
    const classroomPatches: unknown[] = []
    const weekPatchNumbers: number[] = []
    let secondWeekAttempt = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname === '/api/classrooms/12' && method === 'GET') return success({ ...classroomFixture, weekCount: 2 })
      if (pathname === '/api/classrooms/12/weeks' && method === 'GET') return success({ items: createWeeks(2) })
      if (pathname === '/api/classrooms/12/invite-code') return success({ inviteCode: '7QK4-MZ2A' })
      if (pathname === '/api/classrooms/12' && method === 'PATCH') {
        const body = await requestBody(input, init) as Record<string, unknown>
        classroomPatches.push(body)
        return success({ ...classroomFixture, ...body, weekCount: 2 })
      }
      const weekMatch = pathname.match(/\/weeks\/(\d+)$/)
      if (weekMatch && method === 'PATCH') {
        const weekNumber = Number(weekMatch[1])
        weekPatchNumbers.push(weekNumber)
        if (weekNumber === 2 && secondWeekAttempt++ === 0) return failure(500, '2주차 저장 실패')
        const body = await requestBody(input, init) as { title: string }
        return success({ ...createWeeks(2)[weekNumber - 1], title: body.title })
      }
      return new Response(null, { status: 404 })
    })
    renderEditor()

    const dateInput = await screen.findByLabelText('수업 시작일')
    fireEvent.keyDown(dateInput, { key: 'Backspace' })
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()
    fireEvent.change(dateInput, { target: { value: '2026-12-29' } })
    fireEvent.keyDown(dateInput, { key: 'Tab' })
    expect(document.querySelector('output')).toHaveTextContent('2027-01-11')
    fireEvent.change(screen.getByRole('textbox', { name: '1주차 이름' }), { target: { value: '새 1주차' } })
    fireEvent.change(screen.getByRole('textbox', { name: '2주차 이름' }), { target: { value: '새 2주차' } })

    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await screen.findByText('2주차 저장 실패')
    expect(classroomPatches).toHaveLength(1)
    expect(weekPatchNumbers).toEqual([1, 2])
    expect(screen.getByDisplayValue('새 1주차')).toBeInTheDocument()
    expect(screen.getByDisplayValue('새 2주차')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    expect(await screen.findByText('강의실')).toBeInTheDocument()
    expect(classroomPatches).toHaveLength(1)
    expect(weekPatchNumbers).toEqual([1, 2, 2])
  })

  it('uses synchronous locks for save, invite regeneration, and completion', async () => {
    const saveRequest = deferred<Response>()
    const inviteRequest = deferred<Response>()
    const completionRequest = deferred<Response>()
    let saveCalls = 0
    let inviteCalls = 0
    let completionCalls = 0
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname === '/api/classrooms/12' && method === 'GET') return success(classroomFixture)
      if (pathname === '/api/classrooms/12/weeks') return success({ items: createWeeks(1) })
      if (pathname === '/api/classrooms/12/invite-code' && method === 'GET') return success({ inviteCode: '7QK4-MZ2A' })
      if (pathname === '/api/classrooms/12' && method === 'PATCH') { saveCalls += 1; return saveRequest.promise }
      if (pathname.endsWith('/invite-code/regenerate')) { inviteCalls += 1; return inviteRequest.promise }
      if (pathname === '/api/classrooms/12' && method === 'DELETE') { completionCalls += 1; return completionRequest.promise }
      return new Response(null, { status: 404 })
    })
    renderEditor()

    fireEvent.change(await screen.findByLabelText('강의실 이름'), { target: { value: '동시 저장 방지' } })
    const form = document.getElementById('classroom-edit-form') as HTMLFormElement
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(saveCalls).toBe(1)
    expect(screen.getByRole('button', { name: '저장 중' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: '저장 중 새 편집' } })
    await act(async () => saveRequest.resolve(success({ ...classroomFixture, name: '동시 저장 방지' })))

    const regenerateButton = screen.getByRole('button', { name: '재발급' })
    act(() => { fireEvent.click(regenerateButton); fireEvent.click(regenerateButton) })
    expect(inviteCalls).toBe(1)
    expect(screen.getByRole('button', { name: '재발급 중' })).toBeDisabled()
    await act(async () => inviteRequest.resolve(success({ inviteCode: 'NEW-CODE' })))
    expect(await screen.findByText('NEW-CODE')).toBeInTheDocument()

    const completeButton = screen.getByRole('button', { name: '강의실 종료' })
    act(() => { fireEvent.click(completeButton); fireEvent.click(completeButton) })
    expect(completionCalls).toBe(1)
    expect(screen.getByRole('button', { name: '종료 중' })).toBeDisabled()
    await act(async () => completionRequest.resolve(success(null)))
    expect(await screen.findByText('강의실 목록')).toBeInTheDocument()
  })

  it('keeps newer edits made while a save is in flight', async () => {
    const firstWeekSave = deferred<Response>()
    const weekBodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname === '/api/classrooms/12' && method === 'GET') return success({ ...classroomFixture, endDate: '2026-08-09', weekCount: 1 })
      if (pathname === '/api/classrooms/12/weeks' && method === 'GET') return success({ items: createWeeks(1) })
      if (pathname === '/api/classrooms/12/invite-code') return success({ inviteCode: '7QK4-MZ2A' })
      if (pathname === '/api/classrooms/12/weeks/1' && method === 'PATCH') {
        const body = await requestBody(input, init)
        weekBodies.push(body)
        if (weekBodies.length === 1) return firstWeekSave.promise
        return success({ ...createWeeks(1)[0], ...(body as object) })
      }
      return new Response(null, { status: 404 })
    })
    renderEditor()

    const weekInput = await screen.findByRole('textbox', { name: '1주차 이름' })
    fireEvent.change(weekInput, { target: { value: '서버에 저장할 값' } })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    fireEvent.change(weekInput, { target: { value: '저장 중 새 편집' } })
    await act(async () => firstWeekSave.resolve(success({ ...createWeeks(1)[0], title: '서버에 저장할 값' })))

    expect(screen.getByDisplayValue('저장 중 새 편집')).toBeInTheDocument()
    expect(screen.queryByText('강의실')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    expect(await screen.findByText('강의실')).toBeInTheDocument()
    expect(weekBodies).toEqual([{ title: '서버에 저장할 값' }, { title: '저장 중 새 편집' }])
  })

  it.each([
    ['get', 403, '강의실 접근 권한이 없습니다.'],
    ['weeks', 404, '주차 정보를 찾을 수 없습니다.'],
    ['invite', 500, '초대 코드를 불러오지 못했습니다.'],
  ] as const)('separates %s load failures, hides stale data, and retries', async (failedEndpoint, status, message) => {
    let shouldFail = true
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const { pathname } = requestDetails(input)
      const endpoint = pathname === '/api/classrooms/12'
        ? 'get'
        : pathname.endsWith('/weeks')
          ? 'weeks'
          : 'invite'
      if (shouldFail && endpoint === failedEndpoint) return failure(status, message)
      if (endpoint === 'get') return success(classroomFixture)
      if (endpoint === 'weeks') return success({ items: createWeeks(1) })
      if (endpoint === 'invite') return success({ inviteCode: '7QK4-MZ2A' })
      return new Response(null, { status: 404 })
    })
    renderEditor()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('자료구조')).not.toBeInTheDocument()
    expect(screen.queryByText('7QK4-MZ2A')).not.toBeInTheDocument()
    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByDisplayValue('자료구조')).toBeInTheDocument()
    expect(screen.getByText('7QK4-MZ2A')).toBeInTheDocument()
  })

  it('remounts the same route for an account change and ignores old-account responses', async () => {
    const oldGet = deferred<Response>()
    const oldWeeks = deferred<Response>()
    const oldInvite = deferred<Response>()
    let account = 'old'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const { pathname } = requestDetails(input)
      if (account === 'old') {
        if (pathname === '/api/classrooms/12') return oldGet.promise
        if (pathname.endsWith('/weeks')) return oldWeeks.promise
        return oldInvite.promise
      }
      if (pathname === '/api/classrooms/12') return success({ ...classroomFixture, name: '새 계정 강의실' })
      if (pathname.endsWith('/weeks')) return success({ items: createWeeks(1) })
      return success({ inviteCode: 'NEW-ACCOUNT' })
    })
    renderEditor(<AccountSwitchButton onSwitch={() => { account = 'new' }} />)

    fireEvent.click(screen.getByRole('button', { name: '계정 전환' }))
    expect(await screen.findByDisplayValue('새 계정 강의실')).toBeInTheDocument()
    await act(async () => {
      oldGet.resolve(success({ ...classroomFixture, name: '이전 계정 강의실' }))
      oldWeeks.resolve(success({ items: createWeeks(1) }))
      oldInvite.resolve(success({ inviteCode: 'OLD-ACCOUNT' }))
    })
    expect(screen.getByDisplayValue('새 계정 강의실')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('이전 계정 강의실')).not.toBeInTheDocument()
    expect(screen.queryByText('OLD-ACCOUNT')).not.toBeInTheDocument()
  })

  it('does not start old-account week updates after a pending classroom save crosses an account change', async () => {
    const classroomSave = deferred<Response>()
    let account = 'old'
    let weekPatchCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname === '/api/classrooms/12' && method === 'PATCH') return classroomSave.promise
      if (pathname === '/api/classrooms/12/weeks/1' && method === 'PATCH') {
        weekPatchCalls += 1
        return success(createWeeks(1)[0])
      }
      if (pathname === '/api/classrooms/12') {
        return success({ ...classroomFixture, name: account === 'old' ? '자료구조' : '새 계정 강의실' })
      }
      if (pathname === '/api/classrooms/12/weeks') return success({ items: createWeeks(1) })
      if (pathname === '/api/classrooms/12/invite-code') return success({ inviteCode: account === 'old' ? 'OLD-CODE' : 'NEW-CODE' })
      return new Response(null, { status: 404 })
    })
    renderEditor(<AccountSwitchButton onSwitch={() => { account = 'new' }} />)

    fireEvent.change(await screen.findByDisplayValue('자료구조'), { target: { value: '이전 계정 수정' } })
    fireEvent.change(screen.getByRole('textbox', { name: '1주차 이름' }), { target: { value: '이전 계정 주차 수정' } })
    fireEvent.submit(document.getElementById('classroom-edit-form') as HTMLFormElement)
    fireEvent.click(screen.getByRole('button', { name: '계정 전환' }))
    expect(await screen.findByDisplayValue('새 계정 강의실')).toBeInTheDocument()

    await act(async () => {
      classroomSave.resolve(success({ ...classroomFixture, name: '이전 계정 수정' }))
      await classroomSave.promise
    })
    expect(weekPatchCalls).toBe(0)
    expect(screen.getByDisplayValue('새 계정 강의실')).toBeInTheDocument()
  })

  it('keeps delete confirmation on failure, locks duplicates, clears on cancel, and ignores a late success in another account scope', async () => {
    const deleteRequest = deferred<Response>()
    let deleteCalls = 0
    let account = 'old'
    let changedEvents = 0
    window.addEventListener(CLASSROOMS_CHANGED_EVENT, () => { changedEvents += 1 }, { once: true })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname.endsWith('/permanent')) { deleteCalls += 1; return deleteRequest.promise }
      if (pathname === '/api/classrooms/12') return success({ ...classroomFixture, name: account === 'old' ? '자료구조' : '새 계정 강의실' })
      if (pathname.endsWith('/weeks')) return success({ items: createWeeks(1) })
      if (pathname.endsWith('/invite-code') && method === 'GET') return success({ inviteCode: account === 'old' ? 'OLD-CODE' : 'NEW-CODE' })
      return new Response(null, { status: 404 })
    })
    renderEditor(<AccountSwitchButton onSwitch={() => { account = 'new' }} />)

    await screen.findByDisplayValue('자료구조')
    fireEvent.click(screen.getByRole('button', { name: '강의실 삭제' }))
    const confirmation = screen.getByLabelText(/확인을 위해/)
    fireEvent.change(confirmation, { target: { value: '잘못된 이름' } })
    expect(screen.getByRole('button', { name: '영구 삭제' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    fireEvent.click(screen.getByRole('button', { name: '강의실 삭제' }))
    expect(screen.getByLabelText(/확인을 위해/)).toHaveValue('')
    fireEvent.change(screen.getByLabelText(/확인을 위해/), { target: { value: '자료구조' } })
    const dialogForm = screen.getByRole('dialog').querySelector('form') as HTMLFormElement
    act(() => { fireEvent.submit(dialogForm); fireEvent.submit(dialogForm) })
    expect(deleteCalls).toBe(1)
    expect(screen.getByLabelText(/확인을 위해/)).toHaveValue('자료구조')

    fireEvent.click(screen.getByRole('button', { name: '계정 전환' }))
    expect(await screen.findByDisplayValue('새 계정 강의실')).toBeInTheDocument()
    await act(async () => deleteRequest.resolve(success(null)))
    expect(screen.getByDisplayValue('새 계정 강의실')).toBeInTheDocument()
    expect(changedEvents).toBe(0)
  })

  it('preserves delete confirmation after a mocked failure and allows retry', async () => {
    let deleteAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const { method, pathname } = requestDetails(input, init)
      if (pathname.endsWith('/permanent')) {
        deleteAttempts += 1
        return deleteAttempts === 1
          ? failure(500, '영구 삭제 실패')
          : success(null)
      }
      if (pathname === '/api/classrooms/12') return success(classroomFixture)
      if (pathname.endsWith('/weeks')) return success({ items: createWeeks(1) })
      if (pathname.endsWith('/invite-code') && method === 'GET') return success({ inviteCode: '7QK4-MZ2A' })
      return new Response(null, { status: 404 })
    })
    renderEditor()

    await screen.findByDisplayValue('자료구조')
    fireEvent.click(screen.getByRole('button', { name: '강의실 삭제' }))
    const confirmation = screen.getByLabelText(/확인을 위해/)
    fireEvent.change(confirmation, { target: { value: '자료구조' } })
    const form = screen.getByRole('dialog').querySelector('form') as HTMLFormElement
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(deleteAttempts).toBe(1)
    await screen.findByText('영구 삭제 실패')
    expect(confirmation).toHaveValue('자료구조')
    expect(screen.getByRole('button', { name: '영구 삭제' })).toBeEnabled()

    fireEvent.submit(form)
    expect(await screen.findByText('강의실 목록')).toBeInTheDocument()
    expect(deleteAttempts).toBe(2)
  })

  it('does not apply load responses that arrive after unmount', async () => {
    const getRequest = deferred<Response>()
    const weeksRequest = deferred<Response>()
    const inviteRequest = deferred<Response>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const { pathname } = requestDetails(input)
      if (pathname === '/api/classrooms/12') return getRequest.promise
      if (pathname.endsWith('/weeks')) return weeksRequest.promise
      return inviteRequest.promise
    })
    const view = renderEditor()
    await screen.findByText('강의실 정보를 불러오는 중입니다.')
    view.unmount()

    await act(async () => {
      getRequest.resolve(success(classroomFixture))
      weeksRequest.resolve(success({ items: createWeeks(1) }))
      inviteRequest.resolve(success({ inviteCode: 'LATE-CODE' }))
      await Promise.all([getRequest.promise, weeksRequest.promise, inviteRequest.promise])
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(screen.queryByText('LATE-CODE')).not.toBeInTheDocument()
  })
})

const classroomFixture = {
  classroomId: 12,
  color: 'BLUE',
  description: '자료구조 강의실',
  endDate: '2026-11-15',
  instructorName: '박교수',
  learnerCount: 1,
  name: '자료구조',
  pendingRequestCount: 0,
  progressRate: 38,
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 15,
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

function failure(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      error: { code: `HTTP_${status}`, details: [], message },
      success: false,
    }),
    { headers: { 'Content-Type': 'application/json' }, status },
  )
}

function createWeeks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    displayOrder: index + 1,
    materials: [],
    status: 'PUBLISHED',
    title: `${index + 1}주차`,
    weekId: 101 + index,
    weekNumber: index + 1,
  }))
}

function mockReadApis({
  classroom = classroomFixture,
  inviteCode = '7QK4-MZ2A',
  weeks = createWeeks(1),
}: {
  classroom?: typeof classroomFixture
  inviteCode?: string
  weeks?: ReturnType<typeof createWeeks>
} = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { pathname } = requestDetails(input)
    if (pathname === '/api/classrooms/12') return success(classroom)
    if (pathname === '/api/classrooms/12/weeks') return success({ items: weeks })
    if (pathname === '/api/classrooms/12/invite-code') return success({ inviteCode })
    return new Response(null, { status: 404 })
  })
}

function renderEditor(child?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/classrooms/12/edit']}>
      <AuthProvider initialUser={instructorUser}>
        <ToastProvider>
          {child}
          <Routes>
            <Route path="/classrooms/:classroomId/edit" element={<InstructorClassroomEditPage />} />
            <Route path="/classrooms/:classroomId" element={<p>강의실</p>} />
            <Route path="/classrooms" element={<p>강의실 목록</p>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const instructorUser: AuthUser = {
  email: 'instructor@example.com',
  id: 7,
  name: '강의자',
  role: 'INSTRUCTOR',
}

function AccountSwitchButton({ onSwitch }: { onSwitch: () => void }) {
  const { updateUser } = useAuth()
  return (
    <button
      onClick={() => {
        onSwitch()
        updateUser({ ...instructorUser, email: 'other@example.com', id: 8 })
      }}
      type="button"
    >
      계정 전환
    </button>
  )
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  return {
    method: input instanceof Request ? input.method : (init?.method ?? 'GET'),
    pathname: new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname,
  }
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  return input instanceof Request
    ? input.clone().json()
    : JSON.parse(String(init?.body))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}
