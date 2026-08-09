import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { QuizPage } from './QuizPage'

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
    expect(screen.getByText('문항 1 / 1 · 답변 1 / 1')).toBeInTheDocument()
  })

  it('validates an empty answer from an API quiz', async () => {
    renderQuizPage()
    await screen.findByText('문항 1 / 2 · 답변 0 / 2')

    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(screen.getByRole('alert')).toHaveTextContent('답안을 입력하세요.')
  })

  it('locks duplicate submit after the submit API succeeds', async () => {
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(
      await screen.findByRole('button', { name: '제출 완료' }),
    ).toBeDisabled()
    expect(screen.getByRole('heading', { name: '결과' })).toBeInTheDocument()
  })

  it('shows progress across API questions', async () => {
    renderQuizPage()

    expect(
      await screen.findByText('문항 1 / 2 · 답변 0 / 2'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))

    expect(screen.getByText('문항 2 / 2 · 답변 0 / 2')).toBeInTheDocument()
  })

  it('renders the diagnosis action returned by quiz submission', async () => {
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    expect(screen.getByText('정답')).toBeInTheDocument()
    expect(screen.getByText('오답')).toBeInTheDocument()
    expect(screen.getByText('개념의 정의를 먼저 확인한다.')).toBeInTheDocument()
    expect(screen.getByText('50 / 50')).toBeInTheDocument()
    expect(screen.getByText('0 / 50')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '진단으로 이어가기' }),
    ).toHaveAttribute('href', '/sessions/100/diagnosis/42')
    expect(
      screen.queryByText(/정답:|루브릭|private answer/i),
    ).not.toBeInTheDocument()
  })
})
