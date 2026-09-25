import { describe, expect, it, vi } from 'vitest'

import type { ApiSuccess } from '../../shared/api'
import type { AuthenticatedRawRequest, AuthenticatedRequest } from '../auth'
import { createExamsRepository, type CreateExamInput } from './examsRepository'

const examDto = {
  allowRetake: false,
  classroomId: 30,
  dueAt: '2026-12-31T14:59:00Z',
  examId: 10,
  questions: [{ maxScore: 20, questionId: 'q1', questionText: '표준편차란?', questionType: 'SHORT', referenceAnswer: '퍼진 정도' }],
  status: 'DRAFT',
  title: '중간 점검',
  totalScore: 20,
  weekNumber: 4,
}

const submissionDto = {
  attemptNo: 1,
  durationSeconds: 65,
  items: [{ adjustedAt: '2026-08-03T00:01:00Z', answer: '답', correctAnswer: { choiceId: 'a', text: '정답' }, explanation: '시험 해설', manualScore: 20, maxScore: 20, questionId: 'q1', score: 20, verdict: 'CORRECT' }],
  maxScore: 20,
  reviewAvailable: true,
  score: 20,
  startedAt: '2026-08-02T23:58:55Z',
  status: 'GRADED',
  submissionId: 300,
  submittedAt: '2026-08-03T00:00:00Z',
}

describe('exams repository', () => {
  it('maps the learner latestSubmission field from the backend contract', async () => {
    const request = vi.fn().mockResolvedValueOnce(success({
      ...examDto,
      latestSubmission: {
        attemptNo: 2,
        maxScore: 20,
        normalizedScore: 80,
        score: 16,
        status: 'GRADED',
        submissionId: 301,
      },
      status: 'PUBLISHED',
    }))
    const repository = createExamsRepository(request as AuthenticatedRequest)

    await expect(repository.get('10')).resolves.toMatchObject({
      mySubmission: {
        attemptNo: 2,
        id: '301',
        normalizedScore: 80,
        score: 16,
        status: 'GRADED',
      },
    })
  })

  it('connects instructor exam lifecycle endpoints and maps patch presence fields', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success({ items: [examDto], page: 0, size: 100, totalElements: 1, totalPages: 1 }))
      .mockResolvedValueOnce(success(examDto))
      .mockResolvedValueOnce(success(examDto))
      .mockResolvedValueOnce(success(examDto))
      .mockResolvedValueOnce(success({ ...examDto, status: 'PUBLISHED' }))
      .mockResolvedValueOnce(success({ ...examDto, status: 'CLOSED' }))
      .mockResolvedValueOnce(success(undefined))
    const repository = createExamsRepository(request as AuthenticatedRequest)
    const input: CreateExamInput = { allowRetake: false, dueAt: '2026-12-31T14:59:00Z', questions: [{ points: 20, questionText: '표준편차란?', questionType: 'SHORT', referenceAnswer: '퍼진 정도' }], title: '중간 점검', weekNumber: 4 }

    await expect(repository.list('30', 'DRAFT')).resolves.toMatchObject([{ id: '10', questions: [{ id: 'q1', points: 20 }] }])
    await repository.create('30', input)
    await repository.get('10')
    await repository.update('10', { dueAt: input.dueAt, title: '수정 시험', questions: input.questions })
    await repository.publish('10')
    await repository.close('10')
    await repository.delete('10')

    expect(request).toHaveBeenNthCalledWith(1, '/api/classrooms/30/exams?page=0&size=100&status=DRAFT', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, '/api/classrooms/30/exams', expect.objectContaining({ method: 'POST' }))
    expect(request).toHaveBeenNthCalledWith(3, '/api/exams/10', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(4, '/api/exams/10', expect.objectContaining({ body: expect.objectContaining({ dueAt: input.dueAt, dueAtPresent: true, questionsPresent: true, titlePresent: true }), method: 'PATCH' }))
    expect(request).toHaveBeenNthCalledWith(5, '/api/exams/10/publish', { method: 'POST', signal: undefined })
    expect(request).toHaveBeenNthCalledWith(6, '/api/exams/10/close', { method: 'POST', signal: undefined })
    expect(request).toHaveBeenNthCalledWith(7, '/api/exams/10', { method: 'DELETE', signal: undefined })
  })

  it('connects learner submission and instructor result endpoints', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success(undefined))
      .mockResolvedValueOnce(success(submissionDto))
      .mockResolvedValueOnce(success(submissionDto))
      .mockResolvedValueOnce(success(submissionDto))
      .mockResolvedValueOnce(success(submissionDto))
      .mockResolvedValueOnce(success({ ...submissionDto, status: 'SUBMITTED' }))
      .mockResolvedValueOnce(success({ items: [{ ...submissionDto, attemptCount: 1, userId: 7, userName: '김학습' }], page: 0, size: 100, totalElements: 1, totalPages: 1 }))
    const repository = createExamsRepository(request as AuthenticatedRequest)

    await repository.startAttempt('10')
    await expect(repository.submit('10', { q1: '답' }, 'request-1')).resolves.toMatchObject({
      durationSeconds: 65,
      id: '300',
      items: [{ adjustedAt: '2026-08-03T00:01:00Z', correctAnswer: { choiceId: 'a', text: '정답' }, explanation: '시험 해설', manualScore: 20 }],
      reviewAvailable: true,
      startedAt: '2026-08-02T23:58:55Z',
      status: 'GRADED',
    })
    await repository.getMySubmission('10', 1)
    await repository.getSubmission('10', '300')
    await repository.adjustScore('10', '300', 'q1', 18.5)
    await expect(repository.regrade('10', '300')).resolves.toMatchObject({ id: '300', status: 'SUBMITTED' })
    await expect(repository.listSubmissions('10')).resolves.toMatchObject([{ id: '300', userId: '7' }])

    expect(request).toHaveBeenNthCalledWith(1, '/api/exams/10/attempts/start', { method: 'POST', signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, '/api/exams/10/submissions', expect.objectContaining({ body: { answers: [{ answer: '답', questionId: 'q1' }], requestId: 'request-1' }, method: 'POST' }))
    expect(request).toHaveBeenNthCalledWith(3, '/api/exams/10/submissions/me?attemptNo=1', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(4, '/api/exams/10/submissions/300', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(5, '/api/exams/10/submissions/300/answers/q1/score', { body: { score: 18.5 }, method: 'PATCH', signal: undefined })
    expect(request).toHaveBeenNthCalledWith(6, '/api/exams/10/submissions/300/regrade', { method: 'POST', signal: undefined })
    expect(request).toHaveBeenNthCalledWith(7, '/api/exams/10/submissions?page=0&size=100', { signal: undefined })
  })

  it('loads, saves, and exposes version conflicts for server-side attempt drafts', async () => {
    const request = vi.fn()
    const rawRequest = vi.fn()
      .mockResolvedValueOnce(rawSuccess({
        answers: [{ answer: '서버 답안', questionId: 'q1' }],
        savedAt: '2026-09-25T00:00:00Z',
        version: 2,
      }))
      .mockResolvedValueOnce(rawSuccess({ savedAt: '2026-09-25T00:00:02Z', version: 3 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'DRAFT_VERSION_CONFLICT', details: [], message: '충돌' },
        latestDraft: {
          answers: [{ answer: '다른 기기 답안', questionId: 'q1' }],
          savedAt: '2026-09-25T00:00:03Z',
          version: 4,
        },
        success: false,
      }), { headers: { 'Content-Type': 'application/json' }, status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const repository = createExamsRepository(
      request as AuthenticatedRequest,
      rawRequest as AuthenticatedRawRequest,
    )

    await expect(repository.getAttemptDraft('10')).resolves.toMatchObject({
      answers: { q1: '서버 답안' },
      version: 2,
    })
    await expect(repository.saveAttemptDraft('10', { q1: '수정 답안', q2: '' }, 2)).resolves.toMatchObject({
      kind: 'saved',
      version: 3,
    })
    await expect(repository.saveAttemptDraft('10', { q1: '로컬 답안' }, 3)).resolves.toMatchObject({
      kind: 'conflict',
      latestDraft: { answers: { q1: '다른 기기 답안' }, version: 4 },
    })
    await expect(repository.getAttemptDraft('10')).resolves.toBeNull()

    expect(rawRequest).toHaveBeenNthCalledWith(2, '/api/exams/10/attempts/draft', expect.objectContaining({
      body: JSON.stringify({ answers: [{ answer: '수정 답안', questionId: 'q1' }], version: 2 }),
      method: 'PUT',
    }))
  })

  it('generates editable AI question drafts without persisting internal source context fields', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success({
        questions: [{
          answerChoiceId: 'a',
          choices: [{ choiceId: 'a', text: '정답' }, { choiceId: 'b', text: '오답' }],
          explanation: '해설',
          points: 10,
          questionId: 'draft-1',
          questionText: '정답을 고르세요.',
          questionType: 'MCQ',
          sourcePageNumber: 3,
        }],
        schemaVersion: '1.0',
        truncated: true,
      }))
      .mockResolvedValueOnce(success(examDto))
    const repository = createExamsRepository(request as AuthenticatedRequest)

    const draft = await repository.generateDraftQuestions('30', '10', {
      materialIds: ['12'],
      questionPlan: [{ count: 1, questionType: 'MCQ' }],
      weekNumber: 3,
    })
    await repository.update('10', { questions: draft.questions })

    expect(draft).toMatchObject({
      questions: [{ options: [{ id: 'a', text: '정답' }, { id: 'b', text: '오답' }], sourceContextNumber: 3 }],
      truncated: true,
    })
    expect(request).toHaveBeenNthCalledWith(1, '/api/classrooms/30/exams/10/draft-questions', expect.objectContaining({
      body: {
        materialIds: [12],
        questionPlan: [{ count: 1, questionType: 'MCQ' }],
        weekNumber: 3,
      },
      method: 'POST',
    }))
    const updateBody = request.mock.calls[1]?.[1]?.body as { questions: Array<Record<string, unknown>> }
    expect(updateBody.questions[0]).not.toHaveProperty('sourceContextNumber')
  })
})

function success<T>(data: T): ApiSuccess<T> { return { data, message: '성공', success: true } }

function rawSuccess(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '성공', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
