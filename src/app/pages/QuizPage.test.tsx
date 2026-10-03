import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { AuthContext, type AuthContextValue } from '../../features/auth/authContext'
import type { AuthenticatedRequest } from '../../features/auth'
import type { PublicQuizQuestion } from '../../features/quiz'
import { ApiClientError } from '../../shared/api'
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

function QuizRouteSwitcher() {
  const navigate = useNavigate()

  return (
    <>
      <button onClick={() => navigate('/quizzes/51')} type="button">
        다른 퀴즈 열기
      </button>
      <Routes>
        <Route path="/quizzes/:quizId" element={<QuizPage />} />
      </Routes>
    </>
  )
}

function renderSwitchableQuizPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={['/quizzes/50']}>
        <QuizRouteSwitcher />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function createAuthValue(userId: number, apiRequest: AuthenticatedRequest): AuthContextValue {
  return {
    apiRequest,
    rawApiRequest: vi.fn(),
    checkEmailAvailability: vi.fn(),
    clearGoogleSignup: vi.fn(),
    isAuthenticated: true,
    isInitializing: false,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    logoutReason: null,
    pendingGoogleIdToken: null,
    prepareGoogleSignup: vi.fn(),
    setExamInProgress: vi.fn(),
    signup: vi.fn(),
    updateUser: vi.fn(),
    user: {
      email: `learner-${userId}@example.com`,
      id: userId,
      name: `learner-${userId}`,
      role: 'LEARNER',
    },
    withdraw: vi.fn(),
  }
}

function quizEnvelope(questionText: string) {
  return {
    data: {
      questions: [{
        options: [{ optionId: 'shared-choice', text: '공유 보기' }],
        questionId: 'shared-question',
        questionText,
      }],
      quizId: 70,
      quizType: 'MCQ',
      sessionId: 100,
      submitted: false,
      title: '계정별 퀴즈',
    },
    message: '',
    success: true as const,
  }
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

  it('preserves a streamed answer when the server quiz identity arrives', async () => {
    const streamedQuestion: PublicQuizQuestion = {
      choices: [
        { id: 'mcq-a', label: '개념의 정의를 먼저 확인한다.' },
        { id: 'mcq-b', label: '본문 전체를 암기한다.' },
      ],
      id: 'question-mcq',
      kind: 'MCQ',
      prompt: '새 개념을 학습할 때 가장 먼저 확인할 정보는 무엇인가요?',
    }
    const view = render(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace
            embedded
            expectedQuestionCount={2}
            materialId="10"
            progressiveQuestions={[streamedQuestion]}
          />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    fireEvent.click(screen.getByLabelText('개념의 정의를 먼저 확인한다.'))
    expect(screen.getByLabelText('개념의 정의를 먼저 확인한다.')).toBeChecked()

    view.rerender(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace
            embedded
            expectedQuestionCount={2}
            materialId="10"
            progressiveQuestions={[streamedQuestion]}
            quizId="50"
          />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    await waitFor(() => expect(screen.queryByText('문항을 저장하고 있습니다.')).not.toBeInTheDocument())
    expect(screen.getByLabelText('개념의 정의를 먼저 확인한다.')).toBeChecked()
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

  it('locks same-tick duplicate submission before React commits pending state', async () => {
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    const pendingSubmission = deferred<void>()
    let submissionCount = 0
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/quizzes/50/submit') {
        submissionCount += 1
        await pendingSubmission.promise
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderQuizPage()

    await answerAllQuestions()
    const form = screen.getByRole('button', { name: '제출' }).closest('form')
    expect(form).not.toBeNull()
    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(submissionCount).toBe(1)
    pendingSubmission.resolve()
    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
  })

  it('preserves answers after a failed submission and retries explicitly', async () => {
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    let submissionCount = 0
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/quizzes/50/submit') {
        submissionCount += 1
        if (submissionCount === 1) return apiFailure('INTERNAL_SERVER_ERROR', 500)
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('자료를 찾을 수 없습니다.')
    expect(screen.getByLabelText('이해가 낮은 페이지를 다시 읽는다.')).toBeChecked()
    expect(screen.getByRole('button', { name: '제출' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '이전 문항' }))
    expect(screen.getByLabelText('개념의 정의를 먼저 확인한다.')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()
    expect(submissionCount).toBe(2)
  })

  it('resets submitted answers and result when a standalone route changes quiz', async () => {
    renderSwitchableQuizPage()

    await answerAllQuestions()
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    expect(await screen.findByText('점수 48 / 100 · 보완 필요')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다른 퀴즈 열기' }))

    expect(await screen.findByText('현재 설명은 참입니까?')).toBeInTheDocument()
    expect(screen.getByLabelText('O')).toBeEnabled()
    expect(screen.getByLabelText('O')).not.toBeChecked()
    expect(screen.queryByText('점수 48 / 100 · 보완 필요')).not.toBeInTheDocument()
  })

  it('resets embedded access denial when its quiz identity changes', async () => {
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'GET' && new URL(request.url).pathname === '/api/quizzes/50') {
        return apiFailure('MATERIAL_NOT_FOUND', 404)
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    const view = render(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace embedded quizId="50" />
        </MemoryRouter>
      </TestAuthProvider>,
    )
    expect(await screen.findByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).toBeInTheDocument()

    view.rerender(
      <TestAuthProvider>
        <MemoryRouter>
          <QuizWorkspace embedded quizId="51" />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    expect(await screen.findByText('현재 설명은 참입니까?')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('O')).toBeEnabled()
  })

  it('resets answers when the account owner changes on the same quiz route', async () => {
    const requestA = vi.fn(async () => quizEnvelope('A 계정 문항')) as unknown as AuthenticatedRequest
    const requestB = vi.fn(async () => quizEnvelope('B 계정 문항')) as unknown as AuthenticatedRequest
    const view = render(
      <AuthContext.Provider value={createAuthValue(1, requestA)}>
        <MemoryRouter>
          <QuizWorkspace embedded materialId="10" quizId="70" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('A 계정 문항')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('공유 보기'))
    expect(screen.getByLabelText('공유 보기')).toBeChecked()

    view.rerender(
      <AuthContext.Provider value={createAuthValue(2, requestB)}>
        <MemoryRouter>
          <QuizWorkspace embedded materialId="10" quizId="70" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('B 계정 문항')).toBeInTheDocument()
    expect(screen.getByLabelText('공유 보기')).not.toBeChecked()
    expect(requestA).toHaveBeenCalledTimes(1)
    expect(requestB).toHaveBeenCalledTimes(1)
  })

  it('does not reissue account A loading work through account B after an identity change', async () => {
    const pendingAccountA = deferred<ReturnType<typeof quizEnvelope>>()
    const requestA = vi.fn(() => pendingAccountA.promise) as unknown as AuthenticatedRequest
    const requestB = vi.fn(async () => quizEnvelope('B 계정 문항')) as unknown as AuthenticatedRequest
    const view = render(
      <AuthContext.Provider value={createAuthValue(1, requestA)}>
        <MemoryRouter>
          <QuizWorkspace embedded materialId="10" quizId="70" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await waitFor(() => expect(requestA).toHaveBeenCalledTimes(1))

    view.rerender(
      <AuthContext.Provider value={createAuthValue(2, requestB)}>
        <MemoryRouter>
          <QuizWorkspace embedded materialId="10" quizId="70" />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(await screen.findByText('B 계정 문항')).toBeInTheDocument()

    await act(async () => {
      pendingAccountA.reject(new ApiClientError({
        code: 'MATERIAL_NOT_FOUND',
        message: 'A 계정 자료 접근이 만료되었습니다.',
        status: 404,
      }))
      await pendingAccountA.promise.catch(() => undefined)
    })

    expect(screen.getByText('B 계정 문항')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).not.toBeInTheDocument()
    expect(requestA).toHaveBeenCalledTimes(1)
    expect(requestB).toHaveBeenCalledTimes(1)
  })

  it('ignores a late denial from quiz A after quiz B succeeds', async () => {
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    const quizA = deferred<Response>()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'GET' && new URL(request.url).pathname === '/api/quizzes/50') {
        return quizA.promise
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderSwitchableQuizPage()

    fireEvent.click(screen.getByRole('button', { name: '다른 퀴즈 열기' }))
    expect(await screen.findByText('현재 설명은 참입니까?')).toBeInTheDocument()

    await act(async () => {
      quizA.resolve(apiFailure('MATERIAL_NOT_FOUND', 404))
      await quizA.promise
    })

    expect(screen.getByText('현재 설명은 참입니까?')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '퀴즈 결과를 표시할 수 없습니다.' })).not.toBeInTheDocument()
  })

  it('ignores a late success from quiz A after quiz B succeeds', async () => {
    const fixtureFetch = vi.mocked(globalThis.fetch).getMockImplementation()
    const quizA = deferred<Response>()
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'GET' && new URL(request.url).pathname === '/api/quizzes/50') {
        return quizA.promise
      }
      if (!fixtureFetch) throw new Error('API fixture fetch is not installed.')
      return fixtureFetch(input, init)
    })
    renderSwitchableQuizPage()

    fireEvent.click(screen.getByRole('button', { name: '다른 퀴즈 열기' }))
    expect(await screen.findByText('현재 설명은 참입니까?')).toBeInTheDocument()

    await act(async () => {
      quizA.resolve(new Response(JSON.stringify({
        data: {
          questions: [{ options: [{ optionId: 'a', text: '이전 보기' }], questionId: 'old', questionText: '이전 퀴즈 문항' }],
          quizId: 50,
          quizType: 'MCQ',
          sessionId: 100,
          submitted: false,
          title: '이전 퀴즈',
        },
        message: '',
        success: true,
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      await quizA.promise
    })

    expect(screen.getByText('현재 설명은 참입니까?')).toBeInTheDocument()
    expect(screen.queryByText('이전 퀴즈 문항')).not.toBeInTheDocument()
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
