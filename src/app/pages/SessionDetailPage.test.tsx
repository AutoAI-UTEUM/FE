import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiFailure, apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { rememberClassroomId } from '../../features/classrooms'
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

describe('SessionDetailPage', () => {
  it('returns to the remembered classroom week page', async () => {
    rememberClassroomId('12')
    renderSessionDetail()

    expect(
      await screen.findByRole('link', { name: '주차 페이지로' }, { timeout: 3_000 }),
    ).toHaveAttribute('href', '/classrooms/12')
  })

  it('starts with the resource list closed and allows reopening it', async () => {
    renderSessionDetail()

    expect(await screen.findByRole('button', { name: '자료 목록' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '자료 목록 닫기' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '자료 목록' }))
    expect(await screen.findByRole('button', { name: '자료 목록 닫기' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '자료 목록 닫기' }))
    expect(screen.getByRole('button', { name: '자료 목록' })).toBeInTheDocument()
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

  it('keeps the left panel material-only and shows submitted quiz history in My Quizzes', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '자료 목록' }))
    const firstWeekLabel = await screen.findByText('핵심 개념')
    const secondWeekLabel = screen.getByText('심화 학습')
    expect(
      firstWeekLabel.compareDocumentPosition(secondWeekLabel)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('1주차')).toBeInTheDocument()
    expect(screen.getByText('2주차')).toBeInTheDocument()
    expect(screen.getByText('1주차')).toHaveClass('whitespace-nowrap')
    expect(screen.queryByText('8.3 - 8.9')).not.toBeInTheDocument()
    expect(screen.queryByText('8.10 - 8.16')).not.toBeInTheDocument()
    expect(screen.getAllByText('시험 대비 요약.pdf')).toHaveLength(2)
    const longMaterialTitle = screen.getByText('강의 노트 5주차.pdf')
    expect(longMaterialTitle).toHaveClass(
      'overflow-hidden',
      'text-ellipsis',
      'whitespace-nowrap',
    )
    expect(longMaterialTitle).toHaveAttribute(
      'title',
      '강의 노트 5주차.pdf',
    )
    const materialLink = longMaterialTitle.closest('a')
    const materialListItem = materialLink?.closest('li')
    const materialList = materialListItem?.parentElement
    const materialSection = materialList?.parentElement
    const weekList = materialSection?.parentElement
    const resourcePanel = longMaterialTitle.closest('aside')
    expect(materialLink).toHaveClass(
      'min-w-0',
      'w-full',
      'max-w-full',
      'overflow-hidden',
      'min-h-8.5',
      'py-1.5',
    )
    expect(weekList).toHaveClass('gap-2')
    expect(materialListItem).toHaveClass('min-w-0', 'w-full', 'max-w-full')
    expect(materialList).toHaveClass('min-w-0', 'w-full', 'max-w-full')
    expect(materialSection).toHaveClass(
      'min-w-0',
      'w-full',
      'max-w-full',
      'overflow-hidden',
    )
    expect(resourcePanel).not.toHaveClass('[scrollbar-gutter:stable_both-edges]')
    expect(screen.queryByText('학습 확인 퀴즈')).not.toBeInTheDocument()
    expect(screen.queryByText('강의실 자료')).not.toBeInTheDocument()
    expect(screen.queryByText('1/5')).not.toBeInTheDocument()
    expect(screen.queryByText(/^자료 \d+개$/)).not.toBeInTheDocument()
    expect(screen.queryByText('등록된 자료가 없습니다.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /내 퀴즈/ }))
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
