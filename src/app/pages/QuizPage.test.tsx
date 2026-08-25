import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
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

  it('shows the planned-update notice for quiz review after submission', async () => {
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
    expect(input).toBeDisabled()
    expect(screen.getAllByText('추후 업데이트 예정')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '퀴즈 복습 기능 준비 중' })).toBeDisabled()
  })
})
