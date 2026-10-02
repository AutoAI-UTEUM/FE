import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiFailure, apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { rememberClassroomId } from '../../features/classrooms'
import { ResponsiveViewportProvider } from '../../shared/responsive'
import { SessionDetailPage } from './SessionDetailPage'

beforeEach(() => {
  installApiFixtureServer()
  rememberClassroomId('12')
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1600,
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderSessionDetail(path = '/sessions/100') {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/classrooms" element={<p>내 강의실 화면</p>} />
          <Route path="/quizzes/:quizId" element={<p>퀴즈 화면</p>} />
          <Route
            path="/sessions/:sessionId/diagnosis/:diagnosisId"
            element={<p>진단 화면</p>}
          />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

function renderPhoneSessionDetail(path = '/sessions/100') {
  Object.defineProperties(window.screen, {
    height: { configurable: true, value: 844 },
    width: { configurable: true, value: 390 },
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => true,
      matches: query === '(pointer: coarse)' || query === '(orientation: portrait)',
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    } as unknown as MediaQueryList)),
  })

  return render(
    <ResponsiveViewportProvider>
      <TestAuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
            <Route path="/classrooms" element={<p>내 강의실 화면</p>} />
          </Routes>
        </MemoryRouter>
      </TestAuthProvider>
    </ResponsiveViewportProvider>,
  )
}

describe('SessionDetailPage', () => {
  it('switches phone workspace panes without losing the drafted question', async () => {
    renderPhoneSessionDetail()

    await screen.findByRole(
      'progressbar',
      { name: '학습 진행률 1 / 5쪽' },
      { timeout: 3_000 },
    )
    const workspaceTabs = screen.getByRole('tablist', { name: '작업 화면' })
    expect(within(workspaceTabs).getByRole('tab', { name: '자료' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(within(workspaceTabs).getByRole('tab', { name: '학습' }))
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '작성 중인 질문' } })
    fireEvent.click(within(workspaceTabs).getByRole('tab', { name: '자료' }))
    fireEvent.click(within(workspaceTabs).getByRole('tab', { name: '학습' }))

    expect(screen.getByLabelText('질문')).toHaveValue('작성 중인 질문')
  })

  it('does not render the removed resource list on phone', async () => {
    renderPhoneSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    expect(screen.queryByRole('button', { name: '자료 목록' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '자료 목록' })).not.toBeInTheDocument()
  })

  it('returns to the remembered classroom week page', async () => {
    rememberClassroomId('12')
    renderSessionDetail()

    expect(
      await screen.findByRole('link', { name: '주차 페이지로' }, { timeout: 3_000 }),
    ).toHaveAttribute('href', '/classrooms/12')
  })

  it('does not render a resource list control in the PDF toolbar', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    expect(screen.queryByRole('button', { name: '자료 목록' })).not.toBeInTheDocument()
  })

  it('moves and explains the next page from a typed navigation command', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '다음 페이지로 이동해 주세요.' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.'),
    ).toBeInTheDocument()
  })

  it('moves the viewer before explaining the next page from a typed prompt', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '다음 페이지를 설명해 주세요.' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.'),
    ).toBeInTheDocument()
  })

  it('moves forward without automatically explaining the page', async () => {
    renderSessionDetail()

    expect(
      await screen.findByRole(
        'progressbar',
        { name: '학습 진행률 1 / 5쪽' },
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: '학습 진행률 2 / 5쪽' }),
      ).toBeInTheDocument(),
    )
    expect(await screen.findByText('현재 페이지를 설명할까요?')).toBeInTheDocument()
    expect(screen.queryByText('이 페이지는 핵심 개념의 정의를 다룹니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('퀴즈를 진행할까요?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '목차' }))
    fireEvent.click(screen.getByRole('button', { name: '4쪽으로 이동' }))
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: '학습 진행률 4 / 5쪽' }),
      ).toBeInTheDocument(),
    )
  })

  it('exposes a keyboard-adjustable divider for the PDF and chat panels', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    const separator = screen.getByRole('separator', { name: 'PDF와 학습 패널 너비 조절' })
    expect(separator).not.toHaveAttribute('aria-valuenow')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '633')

    fireEvent.doubleClick(separator)
    expect(separator).not.toHaveAttribute('aria-valuenow')
  })

  it('keeps learning as the default right panel tab and exposes the overview panel', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })

    expect(screen.getByRole('tab', { name: '학습' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: '자료 질문' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByLabelText('질문')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '학습 완료' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '시험 대비 요약.pdf' })).toHaveClass(
      'type-section-title',
    )
    expect(screen.getByText('1 / 5쪽')).toHaveClass('type-section-title')

    fireEvent.click(screen.getByRole('tab', { name: '개요' }))

    expect(screen.getByText('개요를 준비 중입니다.')).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'PDF와 학습 패널 너비 조절' })).toBeInTheDocument()
  })

  it('moves the PDF to the start page selected from the material overview', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/materials/10/overview') {
        return apiSuccess({
          content: '## 목차\n\n- 핵심 개념 p.4–5',
          materialId: 10,
          status: 'READY',
          updatedAt: '2026-08-19T00:00:00Z',
        })
      }
      return undefined
    })
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    fireEvent.click(screen.getByRole('tab', { name: '개요' }))
    fireEvent.click(await screen.findByRole('button', { name: 'p.4–5' }))

    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 4 / 5쪽' }),
    ).toBeInTheDocument()
  })

  it('redirects a deleted session URL to the classroom list', async () => {
    renderSessionDetail('/sessions/999')

    expect(await screen.findByText('내 강의실 화면')).toBeInTheDocument()
  })

  it('debounces rapid page changes and sends only the last page after 500ms', async () => {
    const requestedPages: number[] = []
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        const body = await request.json() as { pageNumber: number }
        requestedPages.push(body.pageNumber)
        return apiSuccess({ currentPage: body.pageNumber, uiActions: [] })
      }
      return undefined
    })
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await screen.findByRole('progressbar', { name: '학습 진행률 3 / 5쪽' })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(requestedPages).toEqual([])
    await waitFor(() => expect(requestedPages).toEqual([4]), { timeout: 1_500 })
  })

  it('does not retry a page PATCH conflict and waits for the active turn', async () => {
    let patchCalls = 0
    let completeStream: (() => void) | undefined
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        patchCalls += 1
        return apiFailure('TURN_IN_PROGRESS', '이미 답변 생성 중입니다.', 409)
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/stream') {
        return new Promise<Response>((resolve) => {
          completeStream = () => resolve(new Response(
            'event: completed\ndata: {}\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } },
          ))
        })
      }
      return undefined
    })
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText(
      'AI가 답변 중이에요. 기존 답변이 끝날 때까지 기다려 주세요.',
      {},
      { timeout: 1_500 },
    )).toBeInTheDocument()
    expect(patchCalls).toBe(1)
    expect(screen.getByLabelText('질문')).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 (사용 불가)' })).toBeDisabled()

    completeStream?.()

    await waitFor(() => expect(screen.getByLabelText('질문')).toBeEnabled())
    expect(patchCalls).toBe(1)
  })

  it.each([
    { delayInitialQuizzes: false, savedBeforeWaiting: true },
    { delayInitialQuizzes: false, savedBeforeWaiting: false },
    { delayInitialQuizzes: true, savedBeforeWaiting: true },
  ])('recovers a saved quiz without completed or AI messages (saved before waiting: $savedBeforeWaiting, quiz list delayed: $delayInitialQuizzes)', async ({ delayInitialQuizzes, savedBeforeWaiting }) => {
    let patchCalls = 0
    let quizSaved = false
    let quizReads = 0
    let resolveInitialQuizzes: ((response: Response) => void) | undefined
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        patchCalls += 1
        if (savedBeforeWaiting) quizSaved = true
        return apiFailure('TURN_IN_PROGRESS', '이미 답변 생성 중입니다.', 409)
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions/100') {
        return apiSuccess({
          activeQuizId: quizSaved ? 50 : null,
          currentPage: 1,
          materialId: 10,
          pageStatus: quizSaved ? 'QUIZ_READY' : 'EXPLAINED',
          sessionId: 100,
          status: 'ACTIVE',
          uiActions: [],
        })
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/quizzes') {
        quizReads += 1
        if (delayInitialQuizzes && quizReads === 1) {
          return new Promise<Response>((resolve) => { resolveInitialQuizzes = resolve })
        }
        return apiSuccess({ quizzes: quizSaved ? [{
          quizId: 50,
          quizType: 'MCQ',
          title: '학습 확인 퀴즈',
        }] : [] })
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/messages') {
        return apiSuccess({ hasMore: false, items: [], nextCursor: null })
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/stream') {
        return new Response('event: ready\ndata: {"sessionId":100}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return undefined
    })
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    if (!delayInitialQuizzes) {
      fireEvent.click(screen.getByRole('tab', { name: /내 퀴즈/ }))
      await screen.findByText('생성된 퀴즈가 없습니다.')
      fireEvent.click(screen.getByRole('tab', { name: '학습' }))
    }
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    if (!savedBeforeWaiting) {
      expect(await screen.findByText(
        'AI가 답변 중이에요. 기존 답변이 끝날 때까지 기다려 주세요.',
        {},
        { timeout: 1_500 },
      )).toBeInTheDocument()
      expect(screen.getByLabelText('질문')).toBeDisabled()
      await waitFor(() => expect(quizReads).toBeGreaterThanOrEqual(2))
      quizSaved = true
    }

    expect(await screen.findByRole(
      'button',
      { name: 'PDF로 돌아가기' },
      { timeout: 3_000 },
    )).toBeInTheDocument()
    expect(await screen.findByText('문항 1 / 2')).toBeInTheDocument()
    expect(screen.queryByText(
      'AI가 답변 중이에요. 기존 답변이 끝날 때까지 기다려 주세요.',
    )).not.toBeInTheDocument()
    expect(patchCalls).toBe(1)
    await act(async () => { resolveInitialQuizzes?.(apiSuccess({ quizzes: [] })) })
  })

  it.each(['navigation', 'unmount'])('ignores a delayed page conflict after %s', async (endOfSession) => {
    let resolveOldPageMove: ((response: Response) => void) | undefined
    let resolveNewPageMove: ((response: Response) => void) | undefined
    const streamRequests: string[] = []
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        return new Promise<Response>((resolve) => { resolveOldPageMove = resolve })
      }
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/103/page') {
        return new Promise<Response>((resolve) => { resolveNewPageMove = resolve })
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions/103') {
        return apiSuccess({
          currentPage: 3,
          materialId: 10,
          pageStatus: 'EXPLAINED',
          sessionId: 103,
          status: 'ACTIVE',
          uiActions: [],
        })
      }
      if (request.method === 'GET' && url.pathname.endsWith('/stream')) {
        streamRequests.push(url.pathname)
      }
      return undefined
    })
    const { unmount } = render(
      <TestAuthProvider>
        <MemoryRouter initialEntries={['/sessions/100']}>
          <Link to="/sessions/103">다른 세션으로</Link>
          <Routes>
            <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </TestAuthProvider>,
    )
    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(resolveOldPageMove).toBeTypeOf('function'), { timeout: 1_500 })

    if (endOfSession === 'navigation') {
      fireEvent.click(screen.getByRole('link', { name: '다른 세션으로' }))
      await screen.findByRole('progressbar', { name: '학습 진행률 3 / 5쪽' })
      expect(screen.getByLabelText('질문')).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: '다음' }))
      await waitFor(() => expect(resolveNewPageMove).toBeTypeOf('function'), { timeout: 1_500 })
      expect(screen.getByRole('button', { name: '다음 (사용 불가)' })).toBeDisabled()
    } else {
      unmount()
    }

    await act(async () => {
      resolveOldPageMove?.(apiFailure('TURN_IN_PROGRESS', '이전 세션의 늦은 충돌', 409))
    })
    expect(streamRequests).toEqual([])

    if (endOfSession === 'navigation') {
      expect(screen.getByRole('button', { name: '다음 (사용 불가)' })).toBeDisabled()
      await act(async () => {
        resolveNewPageMove?.(apiSuccess({ currentPage: 4, uiActions: [] }))
      })
      await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled())
      expect(screen.getByRole('progressbar', { name: '학습 진행률 4 / 5쪽' })).toBeInTheDocument()
    }
  })

  it('releases a page move when its quiz baseline fails and allows a safe retry', async () => {
    let quizReads = 0
    let patchCalls = 0
    let turnPosts = 0
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/quizzes') {
        quizReads += 1
        return quizReads <= 2
          ? apiFailure('QUIZ_LIST_UNAVAILABLE', '퀴즈 목록을 불러오지 못했습니다.', 503)
          : apiSuccess({ quizzes: [] })
      }
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        patchCalls += 1
        const body = await request.json() as { pageNumber: number }
        return apiSuccess({ currentPage: body.pageNumber, uiActions: [] })
      }
      if (request.method === 'POST' && url.pathname === '/api/sessions/100/turns') {
        turnPosts += 1
      }
      return undefined
    })
    renderSessionDetail()
    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    await waitFor(() => expect(quizReads).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText(
      '퀴즈 목록을 불러오지 못했습니다.',
      {},
      { timeout: 1_500 },
    )).toBeInTheDocument()
    expect(patchCalls).toBe(0)
    expect(screen.getByLabelText('질문')).toBeEnabled()
    expect(screen.getByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(patchCalls).toBe(1), { timeout: 1_500 })
    await waitFor(() => expect(screen.getByLabelText('질문')).toBeEnabled())
    expect(screen.getByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeInTheDocument()
    expect(screen.queryByText('퀴즈 목록을 불러오지 못했습니다.')).not.toBeInTheDocument()
    expect(turnPosts).toBe(0)
  })

  it.each(['timeout', 'unmount'])('aborts an unresolved pre-page quiz read on %s', async (endOfRequest) => {
    let quizReads = 0
    let patchCalls = 0
    let baselineSignal: AbortSignal | undefined
    let allowRetry = false
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/quizzes') {
        quizReads += 1
        if (quizReads === 1) {
          return apiFailure('QUIZ_LIST_UNAVAILABLE', '목록을 불러오지 못했습니다.', 503)
        }
        if (allowRetry) return apiSuccess({ quizzes: [] })
        baselineSignal = request.signal
        return new Promise<Response>(() => undefined)
      }
      if (request.method === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        patchCalls += 1
        const body = await request.json() as { pageNumber: number }
        return apiSuccess({ currentPage: body.pageNumber, uiActions: [] })
      }
      return undefined
    })
    const { unmount } = renderSessionDetail()
    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    await waitFor(() => expect(quizReads).toBe(1))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    expect(baselineSignal?.aborted).toBe(false)
    expect(patchCalls).toBe(0)
    if (endOfRequest === 'unmount') {
      unmount()
      expect(baselineSignal?.aborted).toBe(true)
      return
    }

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(baselineSignal?.aborted).toBe(true)
    expect(screen.getByText('퀴즈 목록 확인이 지연되고 있습니다. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
    expect(patchCalls).toBe(0)

    allowRetry = true
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(patchCalls).toBe(1)
    expect(screen.getByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
  })

  it('runs an explain turn from the restored widget and shows the AI message', async () => {
    renderSessionDetail()

    expect(
      await screen.findByText('현재 페이지를 설명할까요?'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '네' }))

    expect(
      await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('퀴즈를 진행할까요?')).toBeInTheDocument()
  })

  it('opens the generated quiz inside the PDF workspace and returns to the PDF', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')

    fireEvent.click(screen.getByRole('button', { name: '네' }))
    expect(
      await screen.findByText('어떤 유형의 퀴즈를 풀까요?'),
    ).toBeInTheDocument()
    expect(screen.getByText('(응시 중에는 학습 내용을 볼 수 없습니다.)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '객관식' }))
    expect(await screen.findByRole('button', { name: 'PDF로 돌아가기' })).toBeInTheDocument()
    expect(await screen.findByText('문항 1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '퀴즈 응시 중 채팅 잠금' })).toBeInTheDocument()
    expect(screen.queryByLabelText('질문')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PDF로 돌아가기' }))
    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '퀴즈 응시 중 채팅 잠금' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '퀴즈 계속 풀기' }))
    expect(await screen.findByText('문항 1 / 2')).toBeInTheDocument()
  })

  it('lets the learner answer streamed questions in the quiz workspace while later questions are generated', async () => {
    const encoder = new TextEncoder()
    let streamCalls = 0
    let quizStreamController: ReadableStreamDefaultController<Uint8Array> | undefined
    let resolveQuizTurn: ((response: Response) => void) | undefined
    const streamedQuestions = [
      {
        choices: [
          { choiceId: 'mcq-a', text: '개념의 정의를 먼저 확인한다.' },
          { choiceId: 'mcq-b', text: '본문 전체를 암기한다.' },
        ],
        questionId: 'question-mcq',
        questionText: '새 개념을 학습할 때 가장 먼저 확인할 정보는 무엇인가요?',
      },
      {
        choices: [
          { choiceId: 'review-a', text: '이해가 낮은 페이지를 다시 읽는다.' },
          { choiceId: 'review-b', text: '아무 답이나 선택한다.' },
        ],
        questionId: 'question-review',
        questionText: '학습 중 이해가 낮은 부분이 생기면 어떻게 해야 하나요?',
      },
    ]
    const enqueueQuizQuestion = (questionIndex: number) => {
      quizStreamController?.enqueue(encoder.encode([
        'event: quiz_question',
        `data: ${JSON.stringify({
          generationId: 'generation-1',
          questionCount: streamedQuestions.length,
          questionIndex,
          quizType: 'MCQ',
          question: streamedQuestions[questionIndex - 1],
        })}`,
        '',
        '',
      ].join('\n')))
    }
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/sessions/100/stream') {
        streamCalls += 1
        if (streamCalls !== 2) return undefined
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            quizStreamController = controller
            controller.enqueue(encoder.encode(
              'event: ready\ndata: {"sessionId":100}\n\n',
            ))
          },
        }), { headers: { 'Content-Type': 'text/event-stream' } })
      }
      if (request.method === 'POST' && url.pathname === '/api/sessions/100/turns') {
        const body = await request.clone().json() as { eventType?: string }
        if (body.eventType !== 'QUIZ_TYPE_SELECTED') return undefined
        enqueueQuizQuestion(1)
        return new Promise<Response>((resolve) => { resolveQuizTurn = resolve })
      }
      return undefined
    })
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')
    fireEvent.click(screen.getByRole('button', { name: '네' }))
    fireEvent.click(await screen.findByRole('button', { name: '객관식' }))

    const quizWorkspace = await screen.findByRole('region', { name: '퀴즈 문항' })
    const firstAnswer = within(quizWorkspace).getByLabelText('개념의 정의를 먼저 확인한다.')
    expect(within(quizWorkspace).getByText('문항 1 / 2')).toBeInTheDocument()
    expect(within(quizWorkspace).getByRole('status')).toHaveTextContent('나머지 1개 문항을 생성하고 있습니다.')
    expect(screen.getByRole('region', { name: '퀴즈 응시 중 채팅 잠금' })).toBeInTheDocument()
    expect(within(quizWorkspace).queryByRole('button', { name: '제출' })).not.toBeInTheDocument()

    fireEvent.click(firstAnswer)
    expect(firstAnswer).toBeChecked()

    enqueueQuizQuestion(2)
    expect(await within(quizWorkspace).findByText('문항을 저장하고 있습니다.')).toBeInTheDocument()
    expect(firstAnswer).toBeChecked()
    fireEvent.click(within(quizWorkspace).getByRole('button', { name: '다음 문항' }))
    expect(within(quizWorkspace).getByText('문항 2 / 2')).toBeInTheDocument()
    expect(within(quizWorkspace).queryByRole('button', { name: '제출' })).not.toBeInTheDocument()

    quizStreamController?.enqueue(encoder.encode([
      'event: completed',
      'data: {"result":{}}',
      '',
      '',
    ].join('\n')))
    quizStreamController?.close()

    resolveQuizTurn?.(apiSuccess({
      messages: [],
      state: { activeQuizId: 50 },
      uiActions: [],
    }))

    expect(await within(quizWorkspace).findByRole('button', { name: '제출' })).toBeInTheDocument()
    fireEvent.click(within(quizWorkspace).getByRole('button', { name: '이전 문항' }))
    expect(within(quizWorkspace).getByText('문항 1 / 2')).toBeInTheDocument()
    expect(within(quizWorkspace).getByLabelText('개념의 정의를 먼저 확인한다.')).toBeChecked()
  })

  it('opens quiz review chat immediately after the active quiz is submitted', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')
    fireEvent.click(screen.getByRole('button', { name: '네' }))
    fireEvent.click(await screen.findByRole('button', { name: '객관식' }))

    fireEvent.click(await screen.findByLabelText('개념의 정의를 먼저 확인한다.'))
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
    fireEvent.click(screen.getByLabelText('이해가 낮은 페이지를 다시 읽는다.'))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByLabelText('퀴즈 복습 질문')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '퀴즈 복습 챗' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '퀴즈 응시 중 채팅 잠금' })).not.toBeInTheDocument()
  })

  it('automatically restores a quiz when the session state is QUIZ_READY', async () => {
    renderSessionDetail('/sessions/103')

    expect(await screen.findByRole('button', { name: 'PDF로 돌아가기' })).toBeInTheDocument()
    expect(await screen.findByText('문항 1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PDF로 돌아가기' }))
    expect(await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeInTheDocument()
  })

  it('shows submitted quiz history in My Quizzes', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('tab', { name: /내 퀴즈/ }))
    expect(await screen.findByText('학습 확인 퀴즈')).toBeInTheDocument()
    expect(screen.getByText('객관식')).toBeInTheDocument()
    expect(screen.getByText('48 / 100점')).toBeInTheDocument()
    expect(screen.getByText('보완 필요')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', {
      name: '학습 확인 퀴즈 결과 및 문제 보기',
    }))

    const quizInfo = await screen.findByLabelText('퀴즈 정보')
    expect(within(quizInfo).getByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    expect(screen.getByText('새 개념을 학습할 때 가장 먼저 확인할 정보는 무엇인가요?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('퀴즈 복습 질문')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '퀴즈 복습 챗' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '퀴즈 응시 중 채팅 잠금' })).not.toBeInTheDocument()
  })

  it('dismisses the widget when the no/WAIT branch is chosen', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '아니요' }))

    await waitFor(() =>
      expect(
        screen.queryByText('현재 페이지를 설명할까요?'),
      ).not.toBeInTheDocument(),
    )
  })

  it('replaces a declined quiz proposal with the next server uiActions', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')
    fireEvent.click(screen.getByRole('button', { name: '아니요' }))

    await waitFor(() =>
      expect(screen.queryByText('퀴즈를 진행할까요?')).not.toBeInTheDocument(),
    )
    const declineRequest = vi.mocked(globalThis.fetch).mock.calls
      .map(([input, init]) => new Request(input, init))
      .find((request) => request.url.endsWith('/api/sessions/100/quiz-decline'))
    expect(declineRequest?.method).toBe('POST')
    expect(screen.getByText('다음 페이지로 이동할까요?')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })).toBeInTheDocument()
    const explanationCount = screen.getAllByText('이 페이지는 핵심 개념의 정의를 다룹니다.').length

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeInTheDocument()
    expect(await screen.findByText('현재 페이지를 설명할까요?')).toBeInTheDocument()
    expect(screen.getAllByText('이 페이지는 핵심 개념의 정의를 다룹니다.')).toHaveLength(explanationCount)
    expect(screen.queryByText('퀴즈를 진행할까요?')).not.toBeInTheDocument()
  })

  it('does not repeat a declined quiz proposal on the same page', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method !== 'POST' || url.pathname !== '/api/sessions/100/quiz-decline') {
        return undefined
      }
      return apiSuccess({
        uiActions: [{
          content: '퀴즈를 진행할까요?',
          noEvent: 'WAIT',
          type: 'BINARY_DECISION',
          yesEvent: 'SHOW_QUIZ_TYPE_SELECT',
        }],
      })
    })
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')
    fireEvent.click(screen.getByRole('button', { name: '아니요' }))

    await waitFor(() => {
      expect(screen.queryByText('퀴즈를 진행할까요?')).not.toBeInTheDocument()
    })
  })

  it('suppresses a quiz proposal while a diagnosis is pending', async () => {
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      if (request.method !== 'POST' || url.pathname !== '/api/sessions/100/turns') {
        return undefined
      }
      const body = await request.json() as { eventType?: string }
      if (body.eventType !== 'USER_QUESTION') return undefined
      return apiSuccess({
        messages: [],
        state: {},
        uiActions: [{
          content: '퀴즈를 진행할까요?',
          noEvent: 'WAIT',
          type: 'BINARY_DECISION',
          yesEvent: 'SHOW_QUIZ_TYPE_SELECT',
        }],
      })
    })
    renderSessionDetail()

    const input = await screen.findByLabelText('질문')
    fireEvent.change(input, { target: { value: '이 개념을 다시 설명해 주세요.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(input).toBeEnabled())
    expect(screen.queryByText('퀴즈를 진행할까요?')).not.toBeInTheDocument()
  })

  it('routes an explicit typed explanation command through the learning event', async () => {
    renderSessionDetail()

    await screen.findByText('현재 페이지를 설명할까요?')
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '현재 페이지 설명해줘' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.')).toBeInTheDocument()
    expect(screen.getByText('퀴즈를 진행할까요?')).toBeInTheDocument()
  })
})
