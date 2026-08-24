import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../auth'
import type { MaterialOverview } from '../materials'
import type { SessionsRepository, SessionTurnResult } from '../sessions'
import { ApiClientError } from '../../shared/api'
import { ChatPanel } from './ChatPanel'
import { useSessionChat } from './useSessionChat'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function ChatHarness({
  conversationAction,
  currentPage,
  materialId,
  materialOverview,
  onExplainCurrentPage,
  onExplainNextPage,
  onOverviewPageSelect,
  onTurnCompleted,
  request,
  repository,
  sessionId = '100',
}: {
  conversationAction?: ReactNode
  currentPage?: number
  materialId?: string
  materialOverview?: MaterialOverview | null
  onExplainCurrentPage?: () => void
  onExplainNextPage?: () => void
  onOverviewPageSelect?: (pageNumber: number) => void
  onTurnCompleted?: (result: SessionTurnResult) => void
  request?: AuthenticatedRequest
  repository: SessionsRepository
  sessionId?: string
}) {
  const chat = useSessionChat(repository, sessionId)
  return (
    <ChatPanel
      chat={chat}
      conversationAction={conversationAction}
      currentPage={currentPage}
      materialId={materialId}
      materialOverview={materialOverview}
      onExplainCurrentPage={onExplainCurrentPage}
      onExplainNextPage={onExplainNextPage}
      onOverviewPageSelect={onOverviewPageSelect}
      onTurnCompleted={onTurnCompleted}
      request={request}
      sessionId={sessionId}
    />
  )
}

describe('ChatPanel', () => {
  it('adds the overview tab first while keeping AI chat selected by default', async () => {
    render(<ChatHarness repository={createRepository()} />)

    expect(await screen.findByLabelText('질문')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '개요',
      'AI 채팅',
      '내 퀴즈',
      '내 노트',
    ])
    screen.getAllByRole('tab').forEach((tab) => {
      expect(tab).toHaveClass('type-section-title')
    })
    expect(screen.getByRole('tab', { name: 'AI 채팅' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('button', { name: '대화 새로 시작' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '개요' }))

    expect(screen.getByText('개요를 준비 중입니다.')).toBeInTheDocument()
    expect(screen.getByText('생성이 완료되면 자료의 목차와 흐름이 여기에 표시됩니다.')).toBeInTheDocument()
    expect(screen.queryByLabelText('질문')).not.toBeInTheDocument()
  })

  it('opens the full-material question API in a separate shared chat tab', async () => {
    const request = vi.fn().mockResolvedValue({
      data: { answer: '자료 전체 답변입니다.', warnings: [] },
      message: '요청이 성공했습니다.',
      success: true,
    })
    render(
      <ChatHarness
        materialId="10"
        repository={createRepository()}
        request={request as AuthenticatedRequest}
      />,
    )

    fireEvent.click(await screen.findByRole('tab', { name: '자료 질문' }))
    fireEvent.change(screen.getByLabelText('자료 질문'), {
      target: { value: '전체 흐름을 알려줘' },
    })
    fireEvent.click(screen.getByRole('button', { name: '자료 질문 보내기' }))

    expect(await screen.findByText('자료 전체 답변입니다.')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/api/materials/10/doc-chat', expect.objectContaining({
      body: { history: [], question: '전체 흐름을 알려줘' },
      method: 'POST',
    }))
  })

  it('uses the same 16px layout for quiz and note empty states', async () => {
    render(<ChatHarness repository={createRepository()} />)
    await screen.findByLabelText('질문')

    fireEvent.click(screen.getByRole('tab', { name: '내 퀴즈' }))
    const quizTitle = screen.getByText('생성된 퀴즈가 없습니다.')
    const quizDescription = screen.getByText('학습 중 퀴즈를 만들면 여기에 기록됩니다.')
    expect(quizTitle).toHaveClass('type-section-title')
    expect(quizDescription).toHaveClass('type-section-title')
    const quizLayoutClassName = quizTitle.parentElement?.className

    fireEvent.click(screen.getByRole('tab', { name: '내 노트' }))
    const noteTitle = screen.getByText('저장한 노트가 없습니다.')
    const noteDescription = screen.getByText("AI 답변의 '노트에 저장'을 눌러 정리해 보세요.")
    expect(noteTitle).toHaveClass('type-section-title')
    expect(noteDescription).toHaveClass('type-section-title')
    expect(noteTitle.parentElement?.className).toBe(quizLayoutClassName)
  })

  it('renders material overview markdown when overview content is provided', async () => {
    const onOverviewPageSelect = vi.fn()
    render(
      <ChatHarness
        materialOverview={{
          content: [
            '자료 전체 흐름을 설명하는 요약입니다.',
            '',
            '## 목차',
            '',
            '- **기초 개념** (p.4–11)',
            '  - 핵심 개념을 예제로 연결해 학습합니다.',
            '  - 키워드: 정의, 예제',
          ].join('\n'),
          materialId: '10',
          status: 'READY',
          updatedAt: '2026-08-15T00:00:00Z',
        }}
        onOverviewPageSelect={onOverviewPageSelect}
        repository={createRepository()}
      />,
    )

    fireEvent.click(await screen.findByRole('tab', { name: '개요' }))

    expect(screen.getByRole('heading', { name: '목차' })).toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(2)
    const emphasizedText = screen.getByText('기초 개념')
    expect(emphasizedText.tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*기초 개념\*\*/)).not.toBeInTheDocument()
    expect(screen.getByText('핵심 개념을 예제로 연결해 학습합니다.')).toBeInTheDocument()
    expect(screen.getByText('키워드: 정의, 예제')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'p.4–11' }))
    expect(onOverviewPageSelect).toHaveBeenCalledWith(4)
  })

  it('shows a general failure message for failed material overview generation', async () => {
    render(
      <ChatHarness
        materialOverview={{ materialId: '10', status: 'FAILED' }}
        repository={createRepository()}
      />,
    )

    fireEvent.click(await screen.findByRole('tab', { name: '개요' }))

    expect(screen.getByText('개요를 생성하지 못했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /다시 시도/ })).not.toBeInTheDocument()
  })

  it('renders learning decisions inside the conversation log', async () => {
    render(
      <ChatHarness
        conversationAction={<button type="button">퀴즈를 진행할까요?</button>}
        repository={createRepository()}
      />,
    )

    const action = await screen.findByRole('button', { name: '퀴즈를 진행할까요?' })
    expect(screen.getByRole('log')).toContainElement(action)
    expect(action.closest('[aria-label="AI 진행 안내"]')).toBeInTheDocument()
  })

  it('ignores empty questions without showing an error or sending a turn', async () => {
    const repository = createRepository()
    render(<ChatHarness repository={repository} />)
    const input = await screen.findByLabelText('질문')

    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(repository.submitTurn).not.toHaveBeenCalled()
  })

  it('loads server history and renders the completed turn response', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '이전 답변',
          createdAt: '2026-07-27T00:00:00Z',
          id: '500',
          senderType: 'AI',
        },
      ]),
    })
    render(<ChatHarness repository={repository} />)

    expect(await screen.findByText('이전 답변')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('질문'), {
      target: { value: '이 페이지의 핵심은 무엇인가요?' },
    })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(
      await screen.findByText('서버에서 반환한 답변입니다.'),
    ).toBeInTheDocument()
    expect(repository.submitTurn).toHaveBeenCalledWith(
      '100',
      expect.objectContaining({
        eventType: 'USER_QUESTION',
        payload: {
          includeCurrentPage: true,
          message: '이 페이지의 핵심은 무엇인가요?',
        },
      }),
    )
  })

  it('sends with Enter, keeps Shift+Enter as a newline, and reports turn state', async () => {
    const onTurnCompleted = vi.fn()
    const repository = createRepository({
      submitTurn: vi.fn().mockResolvedValue({
        currentPage: 2,
        messages: [],
        pageStatus: 'IN_PROGRESS',
        uiActions: [],
      }),
    })
    render(
      <ChatHarness
        onTurnCompleted={onTurnCompleted}
        repository={repository}
      />,
    )
    await screen.findByLabelText('질문')
    const input = screen.getByLabelText('질문')

    fireEvent.change(input, { target: { value: '첫 줄' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(repository.submitTurn).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(repository.submitTurn).toHaveBeenCalledOnce())
    expect(onTurnCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ currentPage: 2, pageStatus: 'IN_PROGRESS' }),
    )
  })

  it('attaches page context without rendering an attachment status chip', async () => {
    const repository = createRepository()
    render(<ChatHarness currentPage={3} repository={repository} />)
    await screen.findByLabelText('질문')

    expect(screen.queryByText('현재 페이지 첨부됨 · 3쪽')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('질문'), {
      target: { value: '일반적인 개념만 설명해 주세요.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    await waitFor(() => expect(repository.submitTurn).toHaveBeenCalledWith(
      '100',
      expect.objectContaining({
        eventType: 'USER_QUESTION',
        payload: {
          includeCurrentPage: true,
          message: '일반적인 개념만 설명해 주세요.',
        },
      }),
    ))
  })

  it('routes a next-page explanation command through the page-aware callback', async () => {
    const onExplainNextPage = vi.fn()
    const repository = createRepository()
    render(<ChatHarness onExplainNextPage={onExplainNextPage} repository={repository} />)
    await screen.findByLabelText('질문')

    fireEvent.change(screen.getByLabelText('질문'), {
      target: { value: '다음 페이지를 설명해 주세요.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    await waitFor(() => expect(onExplainNextPage).toHaveBeenCalledOnce())
    expect(repository.submitTurn).not.toHaveBeenCalled()
  })

  it('locks input while the learning turn request is pending', async () => {
    let resolveTurn: ((value: Awaited<
      ReturnType<SessionsRepository['submitTurn']>
    >) => void) | undefined
    const repository = createRepository({
      submitTurn: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTurn = resolve
          }),
      ),
    })
    render(<ChatHarness repository={repository} />)
    await screen.findByLabelText('질문')

    fireEvent.change(screen.getByLabelText('질문'), {
      target: { value: '핵심 개념을 알려 주세요.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(screen.getByLabelText('질문')).toBeDisabled()
    expect(screen.getByRole('button', { name: '응답 대기 중' })).toBeDisabled()

    resolveTurn?.({ messages: [], uiActions: [] })
  })

  it('waits for the existing turn without retrying when the server returns TURN_IN_PROGRESS', async () => {
    let completeStream: (() => void) | undefined
    let hasCompleted = false
    const submitTurn = vi.fn().mockRejectedValue(new ApiClientError({
      code: 'TURN_IN_PROGRESS',
      message: '이미 처리 중인 턴입니다.',
      status: 409,
    }))
    const listMessages = vi.fn().mockImplementation(async () => hasCompleted
      ? [{
          content: '기존 턴의 답변입니다.',
          createdAt: '2026-08-24T06:00:00Z',
          id: 'existing-answer',
          senderType: 'AI' as const,
          status: 'COMPLETED' as const,
        }]
      : [])
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue({
        currentPage: 2,
        id: '100',
        lastActivityAt: '2026-08-24T06:00:00Z',
        materialId: '10',
        materialTitle: '학습 자료.pdf',
        pageStatus: 'EXPLAINED',
        status: 'ACTIVE',
        uiActions: [],
      }),
      listMessages,
      stream: vi.fn().mockImplementation((_sessionId, handlers) =>
        new Promise<void>((resolve) => {
          completeStream = () => {
            hasCompleted = true
            handlers.onCompleted?.()
            resolve()
          }
        })),
      submitTurn,
    })
    render(<ChatHarness repository={repository} />)
    const input = await screen.findByLabelText('질문')

    fireEvent.change(input, { target: { value: '이어서 질문할게요.' } })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'AI가 답변 중이에요. 기존 답변이 끝날 때까지 기다려 주세요.',
    )
    expect(input).toBeDisabled()
    expect(submitTurn).toHaveBeenCalledOnce()
    expect(screen.queryByText('전송 실패')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()

    await act(async () => completeStream?.())

    expect(await screen.findByText('기존 턴의 답변입니다.')).toBeInTheDocument()
    expect(submitTurn).toHaveBeenCalledOnce()
    expect(input).toBeEnabled()
    expect(screen.queryByText('이어서 질문할게요.')).not.toBeInTheDocument()
  })

  it('polls only the message history when the conflict stream is unavailable', async () => {
    let historyCallCount = 0
    const submitTurn = vi.fn().mockRejectedValue(new ApiClientError({
      code: 'TURN_IN_PROGRESS',
      message: '이미 처리 중인 턴입니다.',
      status: 409,
    }))
    const listMessages = vi.fn().mockImplementation(async () => {
      historyCallCount += 1
      return historyCallCount === 1
        ? []
        : [{
            content: '폴링으로 복원한 답변입니다.',
            createdAt: '2026-08-24T06:00:00Z',
            id: 'polled-answer',
            senderType: 'AI' as const,
            status: 'COMPLETED' as const,
          }]
    })
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue(null),
      listMessages,
      stream: vi.fn().mockRejectedValue(new Error('실시간 연결 실패')),
      submitTurn,
    })
    render(<ChatHarness repository={repository} />)
    const input = await screen.findByLabelText('질문')

    fireEvent.change(input, { target: { value: '중복 질문' } })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(await screen.findByText('폴링으로 복원한 답변입니다.')).toBeInTheDocument()
    expect(submitTurn).toHaveBeenCalledOnce()
    expect(listMessages.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('중복 질문')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('retries a failed question with the original request id', async () => {
    const submitTurn = vi.fn()
      .mockRejectedValueOnce(new Error('AI 응답에 실패했습니다.'))
      .mockResolvedValueOnce({ messages: [], uiActions: [] })
    const repository = createRepository({ submitTurn })
    render(<ChatHarness repository={repository} />)
    await screen.findByLabelText('질문')

    fireEvent.change(screen.getByLabelText('질문'), {
      target: { value: '핵심 개념을 알려 주세요.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(await screen.findByText('전송 실패')).toBeInTheDocument()
    const firstRequestId = submitTurn.mock.calls[0]?.[1].requestId
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(submitTurn).toHaveBeenCalledTimes(2))
    expect(submitTurn.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      requestId: firstRequestId,
    }))
  })

  it('labels failed messages restored from server history', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([{
        content: '실패한 질문',
        createdAt: '2026-08-11T00:00:00Z',
        id: '91',
        senderType: 'USER',
        status: 'FAILED',
      }]),
    })
    render(<ChatHarness repository={repository} />)

    expect(await screen.findByText('전송 실패')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('routes both page explanation quick actions through the learning event callback', async () => {
    const onExplainCurrentPage = vi.fn()
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([{
        content: '이전 설명',
        createdAt: '2026-08-05T00:00:00Z',
        id: '1',
        senderType: 'AI',
      }]),
    })
    render(
      <ChatHarness
        onExplainCurrentPage={onExplainCurrentPage}
        repository={repository}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '페이지 설명' }))
    fireEvent.click(screen.getByRole('button', { name: '쉽게 설명해줘' }))

    expect(onExplainCurrentPage).toHaveBeenCalledTimes(2)
    expect(repository.submitTurn).not.toHaveBeenCalled()
  })

  it('restores the chat log to the latest message after visiting my quizzes', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(640)
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([{
        content: '가장 최근 답변',
        createdAt: '2026-08-13T00:00:00Z',
        id: 'latest',
        senderType: 'AI',
      }]),
    })
    render(<ChatHarness repository={repository} />)

    const initialLog = await screen.findByRole('log')
    initialLog.scrollTop = 0
    fireEvent.click(screen.getByRole('tab', { name: '내 퀴즈' }))
    fireEvent.click(screen.getByRole('tab', { name: 'AI 채팅' }))

    expect(screen.getByRole('log')).toHaveProperty('scrollTop', 640)
  })

  it('renders assistant messages as markdown but keeps user text literal', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '**핵심** 개념은 다음과 같습니다.\n\n- 첫째\n- 둘째',
          createdAt: '2026-07-27T00:00:00Z',
          id: '500',
          senderType: 'AI',
        },
        {
          content: '*별표*는 그대로 보여야 합니다.',
          createdAt: '2026-07-27T00:01:00Z',
          id: '501',
          senderType: 'USER',
        },
      ]),
    })
    render(<ChatHarness repository={repository} />)

    const strong = await screen.findByText('핵심')
    expect(strong.tagName).toBe('STRONG')
    expect(strong.closest('.type-chat-body')).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('*별표*는 그대로 보여야 합니다.')).toHaveClass('type-chat-body')
    expect(screen.getByLabelText('질문')).toHaveClass('type-chat-body')
  })

  it('renders inline and display LaTeX in assistant messages', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '인라인 $E = mc^2$와 블록 수식입니다.\n\n$$\nx^2 + y^2 = z^2\n$$',
          createdAt: '2026-08-04T00:00:00Z',
          id: 'latex-1',
          senderType: 'AI',
        },
      ]),
    })
    const { container } = render(<ChatHarness repository={repository} />)

    await screen.findByText(/인라인/)
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
    expect(container.querySelector('.katex-display')).toBeInTheDocument()
  })

  it('adds safe row spacing to fraction matrices', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: String.raw`$$
\nabla f(x)=\begin{bmatrix}\frac{\partial f}{\partial x_1}\\\frac{\partial f}{\partial x_2}\end{bmatrix}
$$`,
          createdAt: '2026-08-06T00:00:00Z',
          id: 'latex-matrix',
          senderType: 'AI',
        },
      ]),
    })
    const { container } = render(<ChatHarness repository={repository} />)

    await waitFor(() => expect(container.querySelector('.katex-display')).toBeInTheDocument())
    expect(container.querySelectorAll('.mfrac')).toHaveLength(2)
    expect(container.querySelector('.katex-mathml annotation')).toHaveTextContent('\\\\[0.5em]')
  })

  it('renders parenthesized LaTeX returned without markdown math delimiters', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '- (w_{t+1}=w_t-v_t)\n- (v_t=\\gamma v_{t-1}+\\alpha\\nabla L(w_t-\\gamma v_{t-1}))',
          createdAt: '2026-08-05T00:00:00Z',
          id: 'latex-2',
          senderType: 'AI',
        },
      ]),
    })
    const { container } = render(<ChatHarness repository={repository} />)

    await screen.findByRole('list')
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
    expect(container.querySelectorAll('.katex-mathml annotation')).toHaveLength(2)
  })

  it('grows the question input with multiline content and caps its height', async () => {
    render(<ChatHarness repository={createRepository()} />)
    const input = await screen.findByLabelText('질문')
    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      value: 72,
    })

    fireEvent.change(input, { target: { value: '첫 줄\n둘째 줄\n셋째 줄' } })

    expect(input).toHaveStyle({ height: '72px', overflowY: 'hidden' })
  })

  it('renders GFM tables and preserves markdown when an answer is saved as a note', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '# 워터마킹\n\n| 유형 | 목적 |\n| --- | --- |\n| zero-bit | 존재 여부 확인 |',
          createdAt: '2026-07-27T00:00:00Z',
          id: '500',
          senderType: 'AI',
        },
      ]),
    })
    render(<ChatHarness repository={repository} />)

    const table = await screen.findByRole('table')
    expect(table).toBeInTheDocument()
    expect(table.closest('.min-w-0')).toHaveClass(
      'dark:[&_table]:bg-stone-50',
      'dark:[&_td]:text-stone-900',
      'dark:[&_th]:bg-stone-100',
    )
    expect(screen.getByRole('button', { name: 'AI 답변 복사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI 답변 공유' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI 답변 복사' }).closest('article')).toBeNull()
    expect(screen.getByText('AI 답변').closest('article')).toHaveClass('w-full', 'min-w-0')
    fireEvent.click(screen.getByRole('button', { name: 'AI 답변 노트에 저장' }))

    expect(await screen.findByRole('heading', { name: '워터마킹' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('keeps the chat visible and reports a note save failure', async () => {
    const request = vi.fn(async (_path: string, options?: { method?: string }) => {
      if (!options?.method || options.method === 'GET') {
        return {
          data: { items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 },
          success: true,
        }
      }
      throw new Error('학습 자료를 찾을 수 없습니다.')
    }) as unknown as AuthenticatedRequest
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '저장할 AI 답변',
          createdAt: '2026-07-27T00:00:00Z',
          id: '500',
          senderType: 'AI',
        },
      ]),
    })

    render(<ChatHarness repository={repository} request={request} />)
    fireEvent.click(await screen.findByRole('button', { name: 'AI 답변 노트에 저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '노트를 저장하지 못했습니다. 학습 자료를 찾을 수 없습니다.',
    )
    expect(screen.getByRole('tab', { name: 'AI 채팅' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '내 노트' })).toHaveAttribute('aria-selected', 'false')
  })

  it('previews a completed note draft and saves it only after confirmation', async () => {
    const request = vi.fn(async (_path: string, options?: { body?: unknown; method?: string }) => {
      if (!options?.method || options.method === 'GET') {
        return {
          data: { items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 },
          success: true,
        }
      }
      return {
        data: { content: '# 역전파 핵심\n\n**기울기**를 연쇄적으로 계산합니다.', noteId: 77, pageNumber: 3 },
        success: true,
      }
    }) as unknown as AuthenticatedRequest
    const repository = createRepository({
      submitTurn: vi.fn().mockResolvedValue({
        messages: [],
        noteDraft: {
          content: '**기울기**를 연쇄적으로 계산합니다.',
          title: '역전파 핵심',
        },
        uiActions: [],
      }),
    })

    render(<ChatHarness currentPage={3} repository={repository} request={request} />)
    const input = await screen.findByLabelText('질문')
    fireEvent.change(input, { target: { value: '노트를 만들어줘' } })
    fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))

    const preview = await screen.findByRole('article', { name: '노트 초안 미리보기' })
    expect(preview).toHaveTextContent('역전파 핵심')
    expect(preview.querySelector('strong')).toHaveTextContent('기울기')
    expect(request).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/sessions/100/notes', {
      body: {
        content: '# 역전파 핵심\n\n**기울기**를 연쇄적으로 계산합니다.',
        pageNumber: 3,
        sourceMessageId: undefined,
      },
      method: 'POST',
    }))
    expect(screen.queryByRole('article', { name: '노트 초안 미리보기' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /내 노트/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows message actions on user chat bubbles', async () => {
    const repository = createRepository({
      listMessages: vi.fn().mockResolvedValue([
        {
          content: '이 질문을 정리해 주세요.',
          createdAt: '2026-07-27T00:00:00Z',
          id: '501',
          senderType: 'USER',
        },
      ]),
    })
    render(<ChatHarness repository={repository} />)

    expect(await screen.findByRole('button', { name: '내 질문 복사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내 질문 공유' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내 질문 노트에 저장' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내 질문 복사' }).closest('article')).toBeNull()
  })
})

function createRepository(
  overrides: Partial<SessionsRepository> = {},
): SessionsRepository {
  return {
    complete: vi.fn(),
    create: vi.fn(),
    declineQuiz: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    listMessages: vi.fn().mockResolvedValue([]),
    listQuizzes: vi.fn(),
    startNewConversation: vi.fn().mockResolvedValue({
      conversationId: '1',
      startedAt: '2026-08-03T00:00:00Z',
    }),
    movePage: vi.fn(),
    stream: vi.fn().mockResolvedValue(undefined),
    submitTurn: vi.fn().mockResolvedValue({
      messages: [
        {
          content: '서버에서 반환한 답변입니다.',
          createdAt: '2026-07-27T00:00:00Z',
          id: '501',
          senderType: 'AI',
        },
      ],
      uiActions: [],
    }),
    ...overrides,
  }
}
