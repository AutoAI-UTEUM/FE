import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ExamDetailPage } from './ExamDetailPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
})

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

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
