import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { InstructorExamSubmissionPage } from './InstructorExamSubmissionPage'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('InstructorExamSubmissionPage', () => {
  it('shows the learner answer, correct answer, feedback, and adjacent learner navigation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/exams/10' && !url.pathname.includes('submissions')) {
        return success({
          allowRetake: false,
          classroomId: 30,
          examId: 10,
          questionCount: 1,
          questions: [{
            explanation: '가장 나중에 들어온 항목이 먼저 나옵니다.',
            maxScore: 10,
            questionId: 'q1',
            questionText: '스택의 특징을 설명하세요.',
            questionType: 'SHORT',
            referenceAnswer: '후입선출',
          }],
          status: 'PUBLISHED',
          title: '자료구조 시험',
          totalScore: 10,
        })
      }
      if (url.pathname === '/api/exams/10/submissions/300') {
        return success({
          attemptNo: 1,
          durationSeconds: 72,
          gradedAt: '2026-09-09T01:02:00Z',
          items: [{ answer: '나중에 넣은 값부터 꺼냅니다.', feedback: '핵심 개념을 정확히 설명했습니다.', maxScore: 10, questionId: 'q1', score: 9, verdict: 'CORRECT' }],
          maxScore: 10,
          normalizedScore: 90,
          score: 9,
          status: 'GRADED',
          submissionId: 300,
          submittedAt: '2026-09-09T01:01:12Z',
        })
      }
      if (url.pathname === '/api/exams/10/submissions/300/answers/q1/score' && init?.method === 'PATCH') {
        return success({
          attemptNo: 1,
          gradedAt: '2026-09-09T01:02:00Z',
          items: [{ adjustedAt: '2026-09-10T01:02:00Z', answer: '나중에 넣은 값부터 꺼냅니다.', feedback: '핵심 개념을 정확히 설명했습니다.', manualScore: 10, maxScore: 10, questionId: 'q1', score: 10, verdict: 'CORRECT' }],
          maxScore: 10,
          normalizedScore: 100,
          score: 10,
          status: 'GRADED',
          submissionId: 300,
          submittedAt: '2026-09-09T01:01:12Z',
        })
      }
      if (url.pathname === '/api/exams/10/submissions') {
        return success({
          items: [
            submissionSummary(299, 7, '이전 학습자'),
            submissionSummary(300, 8, '김서연'),
            submissionSummary(301, 9, '다음 학습자'),
          ],
          page: 0,
          size: 100,
          totalElements: 3,
          totalPages: 1,
        })
      }
      if (url.pathname === '/api/classrooms/30/students') {
        return success({
          items: [{ affiliation: null, aiQuestionCountLast7Days: 0, averageProgressRate: 0, email: 'seoyeon@class.kr', joinedAt: '2026-08-01T00:00:00Z', lastActiveAt: null, name: '김서연', quizSubmissionCount: 0, status: 'ACTIVE', studentId: 8 }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/30/exams/10/submissions/300']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 1, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route element={<InstructorExamSubmissionPage />} path="/classrooms/:classroomId/exams/:examId/submissions/:submissionId" />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '김서연' })).toBeInTheDocument()
    expect(screen.getByText(/seoyeon@class\.kr/)).toBeInTheDocument()
    expect(screen.getByText('학습자 답안').closest('div')).toHaveTextContent('나중에 넣은 값부터 꺼냅니다.')
    expect(screen.getByText('정답', { selector: 'p' }).closest('div')).toHaveTextContent('후입선출')
    expect(screen.getByText('핵심 개념을 정확히 설명했습니다.')).toBeInTheDocument()
    expect(screen.getByText(/소요 1분 12초/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이전 학습자' })).toHaveAttribute('href', '/classrooms/30/exams/10/submissions/299')
    expect(screen.getByRole('link', { name: '다음 학습자' })).toHaveAttribute('href', '/classrooms/30/exams/10/submissions/301')

    fireEvent.change(screen.getByLabelText('1번 점수'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '점수 저장' }))
    await waitFor(() => expect(screen.getByText('직접 수정됨')).toBeInTheDocument())
    expect(screen.getByText('10', { selector: 'strong' })).toBeInTheDocument()
    const scoreCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input instanceof Request ? input.url : input).endsWith('/api/exams/10/submissions/300/answers/q1/score'))
    expect(JSON.parse(String(scoreCall?.[1]?.body))).toEqual({ score: 10 })
  })

  it('does not convert an ungraded instructor result into a zero score', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/exams/10') {
        return success({
          allowRetake: false,
          classroomId: 30,
          examId: 10,
          questionCount: 1,
          questions: [{ maxScore: 10, questionId: 'q1', questionText: '스택의 특징을 설명하세요.', questionType: 'SHORT' }],
          status: 'PUBLISHED',
          title: '자료구조 시험',
          totalScore: 10,
        })
      }
      if (url.pathname === '/api/exams/10/submissions/300') {
        return success({
          attemptNo: 1,
          items: [{ answer: '스택', maxScore: 10, questionId: 'q1', score: null, verdict: null }],
          maxScore: null,
          normalizedScore: null,
          score: null,
          status: 'GRADING_FAILED',
          submissionId: 300,
          submittedAt: '2026-09-09T01:01:12Z',
        })
      }
      if (url.pathname === '/api/exams/10/submissions') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/classrooms/30/students') {
        return success({
          items: [{ aiQuestionCountLast7Days: 0, email: 'seoyeon@class.kr', joinedAt: '2026-08-01T00:00:00Z', name: '김서연', status: 'ACTIVE', studentId: 8 }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/30/exams/10/submissions/300']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 1, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route element={<InstructorExamSubmissionPage />} path="/classrooms/:classroomId/exams/:examId/submissions/:submissionId" />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('채점되지 않음')).toBeInTheDocument()
    expect(screen.queryByText('0/10점')).not.toBeInTheDocument()
    expect(screen.getByText(/정답률 - · 문항 평균 -/)).toBeInTheDocument()
  })
})

function submissionSummary(submissionId: number, userId: number, userName: string) {
  return {
    attemptCount: 1,
    attemptNo: 1,
    gradedAt: '2026-09-09T01:02:00Z',
    maxScore: 10,
    normalizedScore: 90,
    score: 9,
    status: 'GRADED',
    submissionId,
    submittedAt: '2026-09-09T01:01:12Z',
    userId,
    userName,
  }
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
