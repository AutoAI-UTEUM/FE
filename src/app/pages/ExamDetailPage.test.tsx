import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ExamDetailPage } from './ExamDetailPage'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  vi.stubEnv('VITE_API_CAPABILITIES', 'exam-attempt-drafts')
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('ExamDetailPage AI draft', () => {
  it('loads an AI draft into the instructor editor without saving it automatically', async () => {
    let draftBody: unknown
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (method === 'GET' && url.pathname === '/api/exams/10') return success(examFixture)
      if (method === 'POST' && url.pathname === '/api/classrooms/30/exams/10/draft-questions') {
        draftBody = JSON.parse(String(init?.body))
        return success({
          examId: 10,
          questions: [{
            answerChoiceId: 'a',
            choices: [{ choiceId: 'a', text: '스택' }, { choiceId: 'b', text: '큐' }],
            explanation: 'LIFO 구조입니다.',
            points: 10,
            questionId: 'draft-1',
            questionText: '후입선출 자료구조는?',
            questionType: 'MCQ',
            sourcePageNumber: 3,
          }],
          truncated: true,
        })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/30/exams/10']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes><Route element={<ExamDetailPage />} path="/classrooms/:classroomId/exams/:examId" /></Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'AI 초안으로 시작' }))
    expect(screen.getByRole('dialog', { name: 'AI 문항 초안' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('객관식 문항 수'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('단답형 문항 수'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '초안 생성' }))

    expect(await screen.findByDisplayValue('후입선출 자료구조는?')).toBeInTheDocument()
    expect(screen.getByText('참고 자료 3번')).toBeInTheDocument()
    expect(screen.getByText('자료가 많아 앞 30페이지만 사용되었습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경 저장' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(draftBody).toEqual({
      questionPlan: [{ count: 1, questionType: 'MCQ' }],
      weekNumber: 4,
    }))
  })

  it('links each submitted learner to the answer detail page', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/exams/10') {
        return success({ ...examFixture, questionCount: 1, questions: [{ maxScore: 10, questionId: 'q1', questionText: '문항', questionType: 'SHORT' }], status: 'PUBLISHED', totalScore: 10 })
      }
      if (url.pathname === '/api/exams/10/submissions') {
        return success({
          items: [{ attemptCount: 1, attemptNo: 1, gradedAt: '2026-09-09T01:02:00Z', maxScore: 10, normalizedScore: 90, score: 9, status: 'GRADED', submissionId: 300, submittedAt: '2026-09-09T01:01:12Z', userId: 8, userName: '김서연' }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      if (url.pathname === '/api/classrooms/30/students') {
        return success({
          items: [
            { aiQuestionCountLast7Days: 0, email: 'seoyeon@class.kr', joinedAt: '2026-09-01T00:00:00Z', name: '김서연', status: 'ACTIVE', studentId: 8 },
            { aiQuestionCountLast7Days: 0, email: 'learner@class.kr', joinedAt: '2026-09-01T00:00:00Z', name: '미제출 학습자', status: 'ACTIVE', studentId: 9 },
          ],
          page: 0,
          size: 100,
          totalElements: 2,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/30/exams/10']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes><Route element={<ExamDetailPage />} path="/classrooms/:classroomId/exams/:examId" /></Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const answerLinks = await screen.findAllByRole('link', { name: '답안 보기' })
    expect(answerLinks[0]).toHaveAttribute('href', '/classrooms/30/exams/10/submissions/300')
    expect(await screen.findAllByText('미제출 학습자')).not.toHaveLength(0)
    expect(screen.getAllByText('미제출')).not.toHaveLength(0)
  })
})

describe('ExamDetailPage learner submission', () => {
  it('shows the submit button only on the last question and confirms the answered count', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (method === 'GET' && url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        questions: [
          ...learnerExamFixture.questions,
          { maxScore: 10, questionId: 'q2', questionText: '큐의 특징을 설명하세요.', questionType: 'SHORT' },
        ],
        totalScore: 20,
      })
      if (method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-09-09T00:58:50Z' })
      return new Response(null, { status: 404 })
    })

    renderLearnerExam()

    expect(await screen.findByText('스택의 특징을 설명하세요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시험 제출' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('큐의 특징을 설명하세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '시험 제출' }))
    expect(confirmSpy).toHaveBeenCalledWith('전체 2문항 중 0문항에 답변했습니다. 제출하시겠습니까?')
  })

  it('restores a saved answer draft for the current learner and exam', async () => {
    sessionStorage.setItem('exam-draft:10:8', JSON.stringify({ q1: '복원된 답안' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (url.pathname === '/api/exams/10') return success(learnerExamFixture)
      if (method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-09-09T00:58:50Z' })
      return new Response(null, { status: 404 })
    })

    renderLearnerExam()

    const answer = await screen.findByPlaceholderText('답안을 입력하세요')
    expect(answer).toHaveValue('복원된 답안')
    fireEvent.change(answer, { target: { value: '수정한 답안' } })
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem('exam-draft:10:8') ?? '{}')).toEqual({ q1: '수정한 답안' })
    })
  })

  it('restores a server draft so the exam can continue on another device', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (method === 'GET' && url.pathname === '/api/exams/10') return success(learnerExamFixture)
      if (method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-09-09T00:58:50Z' })
      if (method === 'GET' && url.pathname === '/api/exams/10/attempts/draft') {
        return success({
          answers: [{ answer: '다른 기기에서 저장한 답안', questionId: 'q1' }],
          savedAt: '2026-09-25T00:00:00Z',
          version: 2,
        })
      }
      return new Response(null, { status: 404 })
    })

    renderLearnerExam()

    const answer = await screen.findByPlaceholderText('답안을 입력하세요')
    await waitFor(() => expect(answer).toHaveValue('다른 기기에서 저장한 답안'))
    expect(screen.getByText('서버에 저장됨')).toBeInTheDocument()
  })

  it('asks which answer to keep when local and server drafts differ', async () => {
    sessionStorage.setItem('exam-draft:10:8', JSON.stringify({ q1: '현재 기기 답안' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (method === 'GET' && url.pathname === '/api/exams/10') return success(learnerExamFixture)
      if (method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-09-09T00:58:50Z' })
      if (method === 'GET' && url.pathname === '/api/exams/10/attempts/draft') {
        return success({
          answers: [{ answer: '서버 답안', questionId: 'q1' }],
          savedAt: '2026-09-25T00:00:00Z',
          version: 3,
        })
      }
      return new Response(null, { status: 404 })
    })

    renderLearnerExam()

    expect(await screen.findByRole('alert')).toHaveTextContent('다른 기기에 저장된 답안과 현재 답안이 다릅니다.')
    fireEvent.click(screen.getByRole('button', { name: '서버 답안 사용' }))
    expect(screen.getByPlaceholderText('답안을 입력하세요')).toHaveValue('서버 답안')
    expect(screen.queryByRole('button', { name: '현재 답안 유지' })).not.toBeInTheDocument()
  })

  it('replaces the answer form with an immutable completion state after async submission', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (method === 'GET' && url.pathname === '/api/exams/10') return success(learnerExamFixture)
      if (method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-09-09T00:58:50Z' })
      if (method === 'POST' && url.pathname === '/api/exams/10/submissions') {
        return success({
          attemptNo: 1,
          items: [{ answer: '스택', maxScore: 10, questionId: 'q1', score: null, verdict: null }],
          maxScore: 10,
          normalizedScore: null,
          score: null,
          status: 'SUBMITTED',
          submissionId: 300,
          submittedAt: '2026-09-09T01:00:00Z',
        })
      }
      return new Response(null, { status: 404 })
    })

    renderLearnerExam()

    const answer = await screen.findByPlaceholderText('답안을 입력하세요')
    fireEvent.change(answer, { target: { value: '스택' } })
    await waitFor(() => expect(sessionStorage.getItem('exam-draft:10:8')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '시험 제출' }))

    expect(confirmSpy).toHaveBeenCalledWith('전체 1문항 중 1문항에 답변했습니다. 제출하시겠습니까?')
    expect(await screen.findByRole('heading', { name: '시험 제출이 완료되었습니다' })).toBeInTheDocument()
    expect(screen.getByText('제출한 답안은 수정할 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('제출한 답안')).toHaveTextContent('스택')
    expect(screen.queryByPlaceholderText('답안을 입력하세요')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시험 제출' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('exam-draft:10:8')).toBeNull()
  })

  it('restores a completed submission and its feedback after re-entry', async () => {
    const requestedPaths: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      requestedPaths.push(url.pathname)
      if (url.pathname === '/api/exams/10') {
        return success({
          ...learnerExamFixture,
          latestSubmission: {
            attemptNo: 1,
            maxScore: 10,
            normalizedScore: 80,
            score: 8,
            status: 'GRADED',
            submissionId: 300,
          },
          submittable: false,
        })
      }
      if (url.pathname === '/api/exams/10/submissions/me') {
        return success({
          attemptNo: 1,
          durationSeconds: 70,
          gradedAt: '2026-09-09T01:00:10Z',
          items: [{ answer: '스택', correctAnswer: '후입선출', explanation: '가장 나중에 들어온 값이 먼저 나옵니다.', feedback: '핵심 개념을 정확히 작성했습니다.', maxScore: 10, questionId: 'q1', score: 8, verdict: 'CORRECT' }],
          maxScore: 10,
          normalizedScore: 80,
          reviewAvailable: true,
          score: 8,
          startedAt: '2026-09-09T00:58:50Z',
          status: 'GRADED',
          submissionId: 300,
          submittedAt: '2026-09-09T01:00:00Z',
        })
      }
      return new Response(null, { status: 404 })
    })

    renderLearnerExam()

    expect(await screen.findByRole('heading', { name: '시험 제출 및 채점이 완료되었습니다' })).toBeInTheDocument()
    expect(screen.getByText('획득 점수').closest('div')).toHaveTextContent('8/10점')
    expect(screen.getByText('정답 문항').closest('div')).toHaveTextContent('1/1문항')
    expect(screen.getByText('소요 시간').closest('div')).toHaveTextContent('1분 10초')
    expect(screen.getByText('내 답안').closest('div')).toHaveTextContent('스택')
    expect(screen.getByText('정답', { selector: 'p' }).closest('div')).toHaveTextContent('후입선출')
    expect(screen.getByText('가장 나중에 들어온 값이 먼저 나옵니다.')).toBeInTheDocument()
    expect(screen.getByText('핵심 개념을 정확히 작성했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '결과 저장' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '오답 노트 만들기' })).toHaveAttribute('href', '/notes/new')
    expect(requestedPaths).toContain('/api/exams/10/submissions/me')
    expect(screen.queryByPlaceholderText('답안을 입력하세요')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '오답만' }))
    expect(screen.getByRole('heading', { name: '오답이 없습니다' })).toBeInTheDocument()
  })
})

function renderLearnerExam() {
  return render(
    <MemoryRouter initialEntries={['/classrooms/30/exams/10']}>
      <AuthProvider initialUser={{ email: 'learner@example.com', id: 8, name: '학습자', role: 'LEARNER' }}>
        <ToastProvider>
          <Routes><Route element={<ExamDetailPage />} path="/classrooms/:classroomId/exams/:examId" /></Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const examFixture = {
  allowRetake: false,
  classroomId: 30,
  description: '자료구조 평가',
  examId: 10,
  questionCount: 0,
  questions: [],
  status: 'DRAFT',
  title: '중간 점검',
  totalScore: 0,
  weekNumber: 4,
}

const learnerExamFixture = {
  allowRetake: false,
  classroomId: 30,
  description: '자료구조 평가',
  examId: 10,
  latestSubmission: null,
  questions: [{ maxScore: 10, questionId: 'q1', questionText: '스택의 특징을 설명하세요.', questionType: 'SHORT' }],
  status: 'PUBLISHED',
  submittable: true,
  title: '중간 점검',
  totalScore: 10,
  weekNumber: 4,
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
