import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import type { PublicQuizQuestion } from '../../features/quiz'
import { QuizPage, QuizWorkspace } from './QuizPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderQuizPage(path = '/quizzes/50') {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/quizzes/:quizId" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

async function answerAllQuestions() {
  await screen.findByLabelText('개념의 정의를 먼저 확인한다.')
  fireEvent.click(screen.getByLabelText('개념의 정의를 먼저 확인한다.'))
  fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
  fireEvent.click(screen.getByLabelText('이해가 낮은 페이지를 다시 읽는다.'))
}

describe('QuizPage', () => {
  it.each([
    {
      answer: 'choice-a',
      choices: [{ id: 'choice-a', label: '첫 번째 보기' }],
      kind: 'MCQ',
      label: '객관식',
    },
    { answer: 'true', choices: undefined, kind: 'OX', label: 'OX' },
    { answer: '핵심 용어', choices: undefined, kind: 'SHORT', label: '단답형' },
    { answer: '개념을 설명한 서술 답안', choices: undefined, kind: 'ESSAY', label: '서술형' },
  ] as const)('accepts an answer for a streamed $label question', ({ answer, choices, kind }) => {
    const question: PublicQuizQuestion = {
      ...(choices ? { choices: [...choices] } : {}),
      id: `stream-${kind}`,
      kind,
      prompt: `${kind} 생성 문항`,
    }
    render(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace
            embedded
            expectedQuestionCount={3}
            progressiveQuestions={[question]}
          />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    const workspace = screen.getByRole('region', { name: '퀴즈 문항' })
    expect(within(workspace).getByText('문항 1 / 3')).toBeInTheDocument()
    expect(within(workspace).getByRole('status')).toHaveTextContent('나머지 2개 문항을 생성하고 있습니다.')
    expect(within(workspace).queryByRole('button', { name: '제출' })).not.toBeInTheDocument()

    if (kind === 'MCQ') {
      const input = within(workspace).getByLabelText('첫 번째 보기')
      fireEvent.click(input)
      expect(input).toBeChecked()
      return
    }
    if (kind === 'OX') {
      const input = within(workspace).getByLabelText('O')
      fireEvent.click(input)
      expect(input).toBeChecked()
      return
    }

    const input = within(workspace).getByRole('textbox', { name: `${kind} 생성 문항` })
    fireEvent.change(input, { target: { value: answer } })
    expect(input).toHaveValue(answer)
  })

  it('allows O or X to be selected when the API omits options', async () => {
    renderQuizPage('/quizzes/51')

    const trueChoice = await screen.findByLabelText('O')
    const falseChoice = screen.getByLabelText('X')
    expect(trueChoice).not.toBeChecked()
    expect(falseChoice).not.toBeChecked()

    fireEvent.click(trueChoice)
    expect(trueChoice).toBeChecked()
    expect(screen.getByText('문항 1 / 1')).toBeInTheDocument()
  })

  it('validates an empty answer from an API quiz', async () => {
    renderQuizPage()
    await screen.findByText('문항 1 / 2')

    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))

    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(screen.getByRole('alert')).toHaveTextContent('답안을 입력하세요.')
    expect(screen.getByText('문항 1 / 2')).toBeInTheDocument()
  })

  it('locks duplicate submit after the submit API succeeds', async () => {
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출 완료' })).not.toBeInTheDocument()
    expect(screen.getByText('문항 1 / 2')).toBeInTheDocument()
  })

  it('clears quiz state and actions when submission access is revoked', async () => {
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/quizzes/50/submit') {
        return apiFailure('MATERIAL_NOT_FOUND', 404)
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).toBeInTheDocument()
    expect(screen.getByText('이 자료에 접근할 수 없어 퀴즈 결과를 표시할 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '접근 가능한 강의실로 돌아가기' })).toHaveAttribute('href', '/classrooms')
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    expect(screen.queryByText(/[점수].*48/)).not.toBeInTheDocument()
  })

  it('keeps a late quiz response from restoring protected review data', async () => {
    let resolveQuiz: ((response: Response) => void) | undefined
    const delayedQuiz = new Promise<Response>((resolve) => { resolveQuiz = resolve })
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (request.method === 'GET' && path === '/api/quizzes/50') return delayedQuiz
      if (request.method === 'GET' && path === '/api/quizzes/50/submission') return apiFailure('MATERIAL_NOT_FOUND', 404)
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    render(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace
            quizId="50"
            reviewSummary={{ maxScore: 100, passed: true, quizId: '50', quizType: 'MCQ', score: 100, submitted: true, title: '복습 퀴즈' }}
          />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    expect(await screen.findByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).toBeInTheDocument()
    await act(async () => {
      resolveQuiz?.(new Response(JSON.stringify({ data: {
        questions: [{ maxScore: 100, options: [{ optionId: 'a', text: '보기' }], questionId: 'q1', questionText: '보호된 문항' }],
        quizId: 50,
        quizType: 'MCQ',
        sessionId: 100,
        submitted: true,
        title: '복습 퀴즈',
      }, success: true }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).toBeInTheDocument())
    expect(screen.queryByText('보호된 문항')).not.toBeInTheDocument()
    expect(screen.queryByText('점수 100 / 100 · 통과')).not.toBeInTheDocument()
  })

  it('shows a spinning evaluation state while the quiz is being graded', async () => {
    const currentFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    let resolveSubmission: (() => void) | undefined
    const submissionPending = new Promise<void>((resolve) => {
      resolveSubmission = resolve
    })
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/quizzes/50/submit') {
        await submissionPending
      }
      if (!currentFetch) throw new Error('API fixture fetch is not installed.')
      return currentFetch(input, init)
    })
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    const evaluatingButton = await screen.findByRole('button', { name: '평가 중' })
    expect(evaluatingButton).toBeDisabled()
    expect(evaluatingButton.querySelector('.animate-spin')).toBeInTheDocument()

    resolveSubmission?.()
    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출 완료' })).not.toBeInTheDocument()
  })

  it('shows progress across API questions', async () => {
    renderQuizPage()

    expect(await screen.findByText('문항 1 / 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))

    expect(screen.getByText('문항 2 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument()
  })

  it('renders the diagnosis action returned by quiz submission', async () => {
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    let questionResult = screen.getByRole('region', { name: '현재 문항 채점 결과' })
    expect(within(questionResult).getByText('정답')).toBeInTheDocument()
    expect(within(questionResult).getByText('내 답안')).toBeInTheDocument()
    expect(within(questionResult).getByText('50 / 50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
    questionResult = screen.getByRole('region', { name: '현재 문항 채점 결과' })
    expect(within(questionResult).getByText('오답')).toBeInTheDocument()
    expect(within(questionResult).getByText('0 / 50')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '진단으로 이어가기' }),
    ).toHaveAttribute('href', '/sessions/100/diagnosis/42')
    expect(
      screen.queryByText(/정답:|루브릭|private answer/i),
    ).not.toBeInTheDocument()
  })

  it('restores answers, verdicts, correct answers, and explanations in review mode', async () => {
    render(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace
            embedded
            quizId="50"
            reviewSummary={{
              maxScore: 100,
              passed: false,
              quizId: '50',
              quizType: 'MCQ',
              score: 48,
              submitted: true,
              title: '학습 확인 퀴즈',
            }}
          />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    expect(screen.getByText('정답')).toBeInTheDocument()
    expect(screen.getByText('정답·기준 답안')).toBeInTheDocument()
    expect(screen.getByText('해설')).toBeInTheDocument()
    expect(screen.getByText('새 개념은 정의부터 확인해야 합니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
    expect(screen.getByText('오답')).toBeInTheDocument()
    expect(screen.getByText('이해가 낮은 페이지를 복습해야 합니다.')).toBeInTheDocument()
    expect(screen.getByText('복습 순서를 다시 확인해 보세요.')).toBeInTheDocument()
  })

  it('opens quiz review chat after submission', async () => {
    render(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace
            embedded
            materialId="10"
            quizId="50"
            reviewSummary={{
              maxScore: 100,
              passed: false,
              quizId: '50',
              quizType: 'MCQ',
              score: 48,
              submitted: true,
              title: '학습 확인 퀴즈',
            }}
          />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    const input = await screen.findByLabelText('퀴즈 복습 질문')
    expect(input).toBeEnabled()
    const reviewWorkspace = screen.getByRole('region', { name: '퀴즈 복습 작업 영역' })
    expect(reviewWorkspace).toHaveClass(
      'study-session-content',
      'lg:h-full',
      'overflow-hidden',
    )
    expect(within(reviewWorkspace).getByRole('region', { name: '퀴즈 문항' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '퀴즈 복습 챗' })).toHaveClass('!rounded-none', '!border-0')
    const separator = screen.getByRole('separator', { name: '퀴즈와 복습 패널 너비 조절' })
    expect(separator).not.toHaveAttribute('aria-valuenow')
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow')
    fireEvent.doubleClick(separator)
    expect(separator).not.toHaveAttribute('aria-valuenow')
    fireEvent.change(input, { target: { value: '틀린 이유를 알려줘' } })
    fireEvent.click(screen.getByRole('button', { name: '퀴즈 복습 질문 보내기' }))

    expect(await screen.findByText("제출한 퀴즈를 기준으로 '틀린 이유를 알려줘'을 다시 설명할게요.")).toBeInTheDocument()
  })
})

function apiFailure(code: string, status: number): Response {
  return new Response(JSON.stringify({
    error: { code, details: [], message: '자료를 찾을 수 없습니다.' },
    success: false,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}
