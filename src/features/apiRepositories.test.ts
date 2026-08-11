import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiSuccess } from '../shared/api'
import type {
  AuthenticatedRawRequest,
  AuthenticatedRequest,
} from './auth'
import { createMaterialsRepository } from './materials'
import { createMemoryRepository } from './memory'
import { createQuizRepository } from './quiz'
import { createSessionsRepository } from './sessions'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('remote feature repositories', () => {
  it('maps paged materials and uploads multipart data', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          items: [
            {
              createdAt: '2026-07-27T00:00:00Z',
              materialId: 10,
              pageCount: 12,
              processingStatus: 'READY',
              title: '자료.pdf',
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        }),
      )
      .mockResolvedValueOnce(
        success({
          createdAt: '2026-07-27T00:00:00Z',
          materialId: 11,
          processingStatus: 'PROCESSING',
          title: '새 자료.pdf',
        }),
      )
    const repository = createMaterialsRepository(request as AuthenticatedRequest)

    await expect(repository.list()).resolves.toMatchObject([
      { id: '10', pageCount: 12, status: 'READY' },
    ])
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/materials?page=0&size=20',
      { signal: undefined },
    )

    const file = new File(['pdf'], '새 자료.pdf', { type: 'application/pdf' })
    await expect(repository.upload(file)).resolves.toMatchObject({
      id: '11',
      status: 'PROCESSING',
    })
    const uploadOptions = request.mock.calls[1]?.[1] as {
      body: FormData
      method: string
    }
    expect(uploadOptions.method).toBe('POST')
    expect(uploadOptions.body.get('file')).toBe(file)
    expect(uploadOptions.body.get('title')).toBe('새 자료.pdf')
  })

  it('loads authenticated PDF files as binary data', async () => {
    const request = vi.fn()
    const rawRequest = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'Content-Type': 'application/pdf' },
      }),
    )
    const repository = createMaterialsRepository(
      request as AuthenticatedRequest,
      rawRequest as AuthenticatedRawRequest,
    )

    await expect(repository.getFile('10')).resolves.toHaveProperty('size', 4)
    expect(rawRequest).toHaveBeenCalledWith('/api/materials/10/file', {
      headers: { Accept: 'application/pdf' },
      signal: undefined,
    })
  })

  it('parses session SSE content events', async () => {
    const encoder = new TextEncoder()
    const rawRequest = vi.fn().mockResolvedValue(
      new Response(
        encoder.encode(
          'event: status\ndata: {"stage":"GENERATING"}\n\nevent: content_delta\ndata: {"text":"실시간 답변"}\n\nevent: ui_action\ndata: {"action":{"type":"MOVE_NEXT_PAGE","content":"다음 쪽으로 이동"}}\n\nevent: completed\ndata: {}\n\n',
        ),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    const repository = createSessionsRepository(
      vi.fn() as AuthenticatedRequest,
      rawRequest as AuthenticatedRawRequest,
    )
    const handlers = {
      onCompleted: vi.fn(),
      onContentDelta: vi.fn(),
      onStatus: vi.fn(),
      onUiAction: vi.fn(),
    }

    await repository.stream('100', handlers)

    expect(handlers.onStatus).toHaveBeenCalledWith('GENERATING')
    expect(handlers.onContentDelta).toHaveBeenCalledWith('실시간 답변')
    expect(handlers.onUiAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'MOVE_NEXT_PAGE',
        label: '다음 쪽으로 이동',
      }),
    )
    expect(handlers.onCompleted).toHaveBeenCalledOnce()
  })

  it('sends session page moves and learning turns using the contract paths', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        success({ currentPage: 4, pageStatus: 'NOT_EXPLAINED', uiActions: [] }),
      )
      .mockResolvedValueOnce(
        success({
          uiActions: [{ content: '다음 페이지로 이동할까요?', noEvent: 'WAIT', type: 'BINARY_DECISION', yesEvent: 'MOVE_NEXT_PAGE' }],
        }),
      )
      .mockResolvedValueOnce(
        success({
          messages: [
            {
              content: '답변',
              createdAt: '2026-07-27T00:00:00Z',
              messageId: 501,
              senderType: 'AI',
              status: 'COMPLETED',
            },
          ],
          state: { currentPage: 3, pageStatus: 'IN_PROGRESS' },
          uiActions: [],
        }),
      )
      .mockResolvedValueOnce(
        success({ conversationId: 9, startedAt: '2026-08-03T00:00:00Z' }),
      )
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.movePage('100', 4)).resolves.toMatchObject({
      currentPage: 4,
      pageStatus: 'NOT_EXPLAINED',
    })
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/sessions/100/page',
      expect.objectContaining({
        body: { pageNumber: 4 },
        method: 'PATCH',
      }),
    )

    await expect(repository.declineQuiz('100')).resolves.toMatchObject({
      messages: [],
      uiActions: [{ kind: 'BINARY_DECISION', yesEvent: 'MOVE_NEXT_PAGE' }],
    })
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/sessions/100/quiz-decline',
      { method: 'POST', signal: undefined },
    )

    await expect(
      repository.submitTurn('100', {
        eventType: 'USER_QUESTION',
        payload: { message: '질문' },
        requestId: 'request-1',
      }),
    ).resolves.toMatchObject({
      currentPage: 3,
      messages: [{ id: '501', senderType: 'AI', status: 'COMPLETED' }],
      pageStatus: 'IN_PROGRESS',
    })
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/sessions/100/turns',
      expect.objectContaining({
        body: {
          eventType: 'USER_QUESTION',
          payload: { message: '질문' },
          requestId: 'request-1',
        },
        method: 'POST',
      }),
    )

    await expect(repository.startNewConversation('100')).resolves.toEqual({
      conversationId: '9',
      startedAt: '2026-08-03T00:00:00Z',
    })
    expect(request).toHaveBeenNthCalledWith(
      4,
      '/api/sessions/100/conversations',
      { method: 'POST', signal: undefined },
    )
  })

  it('preserves explicit nulls that clear quiz and diagnosis state', async () => {
    const request = vi.fn().mockResolvedValue(
      success({
        messages: [],
        state: { activeQuizId: null, pendingDiagnosis: null },
        uiActions: [],
      }),
    )
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.submitTurn('100', {
      eventType: 'USER_QUESTION',
      payload: { message: '계속 학습할게' },
      requestId: 'clear-state-1',
    })).resolves.toMatchObject({
      activeQuizId: null,
      pendingDiagnosis: null,
    })
  })

  it('maps the non-paged session quiz history response', async () => {
    const request = vi.fn().mockResolvedValue(
      success({
        quizzes: [
          {
            createdAt: '2026-07-27T00:00:00Z',
            maxScore: 100,
            passed: false,
            quizId: 50,
            quizType: 'MCQ',
            score: 48,
            submitted: true,
            title: '학습 확인 퀴즈',
          },
        ],
      }),
    )
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.listQuizzes('100')).resolves.toEqual([
      {
        createdAt: '2026-07-27T00:00:00Z',
        maxScore: 100,
        passed: false,
        quizId: '50',
        quizType: 'MCQ',
        score: 48,
        submitted: true,
        title: '학습 확인 퀴즈',
      },
    ])
    expect(request).toHaveBeenCalledWith('/api/sessions/100/quizzes', {
      signal: undefined,
    })
  })

  it('maps the non-paged session quiz history response', async () => {
    const request = vi.fn().mockResolvedValue(
      success({
        quizzes: [
          {
            createdAt: '2026-07-27T00:00:00Z',
            maxScore: 100,
            passed: false,
            quizId: 50,
            quizType: 'MCQ',
            score: 48,
            submitted: true,
            title: '학습 확인 퀴즈',
          },
        ],
      }),
    )
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.listQuizzes('100')).resolves.toEqual([
      {
        createdAt: '2026-07-27T00:00:00Z',
        maxScore: 100,
        passed: false,
        quizId: '50',
        quizType: 'MCQ',
        score: 48,
        submitted: true,
        title: '학습 확인 퀴즈',
      },
    ])
    expect(request).toHaveBeenCalledWith('/api/sessions/100/quizzes', {
      signal: undefined,
    })
  })

  it('maps every server widget kind and drops malformed ones', async () => {
    const request = vi.fn().mockResolvedValue(
      success({
        currentPage: 1,
        materialId: 10,
        sessionId: 100,
        status: 'ACTIVE',
        uiActions: [
          {
            content: '강의를 시작할까요?',
            noEvent: 'WAIT',
            type: 'BINARY_DECISION',
            yesEvent: 'EXPLAIN_CURRENT_PAGE',
          },
          {
            content: '학습을 완료할까요?',
            noEvent: 'WAIT',
            type: 'BINARY_DECISION',
            yesEvent: 'COMPLETE_SESSION',
          },
          { content: '어디서 막혔나요?', diagnosisId: 30, type: 'DIAGNOSIS_QUESTION' },
          { content: '알 수 없는 이벤트', noEvent: 'WAIT', type: 'BINARY_DECISION', yesEvent: 'UNKNOWN' },
          { type: 'DIAGNOSIS_QUESTION' },
          { content: '다음으로', type: 'MOVE_NEXT_PAGE' },
          { durationMs: 500, type: 'WAIT' },
        ],
      }),
    )
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    const session = await repository.getById('100')

    expect(session?.uiActions).toEqual([
      {
        kind: 'BINARY_DECISION',
        label: '강의를 시작할까요?',
        noEvent: 'WAIT',
        yesEvent: 'EXPLAIN_CURRENT_PAGE',
      },
      {
        kind: 'BINARY_DECISION',
        label: '학습을 완료할까요?',
        noEvent: 'WAIT',
        yesEvent: 'COMPLETE_SESSION',
      },
      { diagnosisId: '30', kind: 'DIAGNOSIS_QUESTION', label: '어디서 막혔나요?' },
      { kind: 'MOVE_NEXT_PAGE', label: '다음으로', step: 1 },
      { durationMs: 500, kind: 'WAIT', label: '현재 페이지에서 계속 학습' },
    ])
  })

  it('maps public quiz fields and diagnosis actions without private answers', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          questions: [
            {
              maxScore: 100,
              options: [{ optionId: 'a', text: '선택지' }],
              questionId: 'q1',
              questionText: '문제',
            },
          ],
          quizId: 50,
          quizType: 'MCQ',
          sessionId: 100,
          submitted: false,
          title: '퀴즈',
        }),
      )
      .mockResolvedValueOnce(
        success({
          gradingResult: {
            items: [{ feedback: '정답입니다.', maxScore: 100, questionId: 'q1', score: 40, verdict: 'PARTIAL' }],
          },
          maxScore: 100,
          passed: false,
          quizId: 50,
          score: 40,
          submissionId: 200,
          uiActions: [{ diagnosisId: 30, type: 'DIAGNOSIS_QUESTION' }],
        }),
      )
    const repository = createQuizRepository(request as AuthenticatedRequest)
    const quiz = await repository.getById('50')

    expect(quiz).toMatchObject({
      id: '50',
      questions: [
        {
          choices: [{ id: 'a', label: '선택지' }],
          id: 'q1',
          kind: 'MCQ',
          prompt: '문제',
        },
      ],
      sessionId: '100',
    })
    expect(quiz && JSON.stringify(quiz)).not.toMatch(/correctAnswer|rubric/i)

    await expect(
      repository.submit(quiz!, { q1: 'a' }),
    ).resolves.toMatchObject({
      diagnosisEntry: { diagnosisId: '30', sessionId: '100' },
      feedback: [{ maxScore: 100, message: '정답입니다.', questionId: 'q1', score: 40, verdict: 'PARTIAL' }],
      score: 40,
    })
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/quizzes/50/submit',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('creates selectable O/X choices with the documented boolean answer values', async () => {
    const request = vi.fn().mockResolvedValue(
      success({
        questions: [
          {
            maxScore: 100,
            questionId: 'q-ox',
            questionText: '이 설명은 맞습니까?',
          },
        ],
        quizId: 51,
        quizType: 'OX',
        sessionId: 100,
        submitted: false,
        title: 'OX 확인 퀴즈',
      }),
    )
    const repository = createQuizRepository(request as AuthenticatedRequest)

    await expect(repository.getById('51')).resolves.toMatchObject({
      questions: [
        {
          choices: [
            { id: 'true', label: 'O' },
            { id: 'false', label: 'X' },
          ],
          kind: 'OX',
        },
      ],
    })
  })

  it('loads learner memory using the material query parameter', async () => {
    const request = vi.fn().mockResolvedValue(
      success({
        explanationPreferences: ['쉬운 예시 중심 설명 선호'],
        materialId: 10,
        memoryDigest: '수식 전개를 어려워함',
        preferredQuizTypes: ['MCQ'],
        strengths: ['평균 개념을 정확히 사용함'],
        updatedAt: '2026-07-10T09:00:00Z',
        weaknesses: ['수식 전개 과정 설명'],
      }),
    )
    const repository = createMemoryRepository(request as AuthenticatedRequest)

    await expect(repository.getByMaterial('10')).resolves.toEqual({
      explanationPreferences: ['쉬운 예시 중심 설명 선호'],
      materialId: '10',
      memoryDigest: '수식 전개를 어려워함',
      preferredQuizTypes: ['MCQ'],
      strengths: ['평균 개념을 정확히 사용함'],
      updatedAt: '2026-07-10T09:00:00Z',
      weaknesses: ['수식 전개 과정 설명'],
    })
    expect(request).toHaveBeenCalledWith(
      '/api/users/me/memory?materialId=10',
      { signal: undefined },
    )
  })
})

function success<T>(data: T): ApiSuccess<T> {
  return {
    data,
    message: '요청이 성공했습니다.',
    success: true,
  }
}
