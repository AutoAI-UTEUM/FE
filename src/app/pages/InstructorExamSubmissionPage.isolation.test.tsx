import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

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

describe('InstructorExamSubmissionPage state isolation', () => {
  it('hides learner A while learner B is loading and cannot save A draft to B', async () => {
    const learnerB = deferred<Response>()
    const patchCalls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      if (init?.method === 'PATCH') {
        patchCalls.push(url.pathname)
        return success(submission(301, 'answer-b', 8))
      }
      if (url.pathname === '/api/exams/10/submissions/301') return learnerB.promise
      return gradingReadResponse(url.pathname, 300, 'answer-a')
    })

    renderSubmissionPage('/classrooms/30/exams/10/submissions/300')
    expect(await screen.findByText('answer-a')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })

    fireEvent.click(nextLearnerLink())

    expect(screen.queryByText('answer-a')).not.toBeInTheDocument()
    const staleSave = screen.queryByRole('spinbutton')?.closest('div')?.querySelector('button')
    if (staleSave) fireEvent.click(staleSave)
    expect(patchCalls).toEqual([])

    learnerB.resolve(success(submission(301, 'answer-b', 8)))
    expect(await screen.findByText('answer-b')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(8)
  })

  it('ignores a learner A read that resolves after learner B', async () => {
    const learnerARead = deferred<Response>()
    let learnerAReads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input)
      if (url.pathname === '/api/exams/10/submissions/300') {
        learnerAReads += 1
        return learnerARead.promise
      }
      return gradingReadResponse(url.pathname, 301, 'answer-b')
    })

    renderSubmissionPage('/classrooms/30/exams/10/submissions/300', true)
    await waitFor(() => expect(learnerAReads).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Go to learner B' }))
    expect(await screen.findByText('answer-b')).toBeInTheDocument()

    learnerARead.resolve(success(submission(300, 'late-answer-a', 9)))
    await act(async () => { await learnerARead.promise })

    expect(screen.getByText('answer-b')).toBeInTheDocument()
    expect(screen.queryByText('late-answer-a')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(8)
  })

  it('ignores a late learner A score response after learner B is loaded', async () => {
    const learnerAAdjustment = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      if (url.pathname === '/api/exams/10/submissions/300/answers/q1/score' && init?.method === 'PATCH') {
        return learnerAAdjustment.promise
      }
      const activeSubmissionId = url.pathname === '/api/exams/10/submissions/301' ? 301 : 300
      const answer = activeSubmissionId === 301 ? 'answer-b' : 'answer-a'
      return gradingReadResponse(url.pathname, activeSubmissionId, answer)
    })

    renderSubmissionPage('/classrooms/30/exams/10/submissions/300')
    expect(await screen.findByText('answer-a')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })
    fireEvent.click(scoreSaveButton())
    fireEvent.click(nextLearnerLink())
    expect(await screen.findByText('answer-b')).toBeInTheDocument()

    learnerAAdjustment.resolve(success(submission(300, 'late-answer-a', 7)))
    await act(async () => { await learnerAAdjustment.promise })

    expect(screen.getByText('answer-b')).toBeInTheDocument()
    expect(screen.queryByText('late-answer-a')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(8)
  })

  it('hides learner A on a delayed learner B 403 and retries the read', async () => {
    const firstLearnerBRead = deferred<Response>()
    let learnerBReads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input)
      if (url.pathname === '/api/exams/10/submissions/301') {
        learnerBReads += 1
        if (learnerBReads === 1) return firstLearnerBRead.promise
        return success(submission(301, 'answer-b-after-retry', 8))
      }
      return gradingReadResponse(url.pathname, 300, 'answer-a')
    })

    renderSubmissionPage('/classrooms/30/exams/10/submissions/300')
    expect(await screen.findByText('answer-a')).toBeInTheDocument()
    fireEvent.click(nextLearnerLink())
    expect(screen.queryByText('answer-a')).not.toBeInTheDocument()

    firstLearnerBRead.resolve(failure('SUBMISSION_FORBIDDEN', 'forbidden learner B', 403))
    const loadError = await screen.findByRole('alert')
    expect(loadError).toHaveTextContent('forbidden learner B')
    expect(screen.queryByText('answer-a')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

    const retryButton = loadError.querySelector('button')
    expect(retryButton).not.toBeNull()
    fireEvent.click(retryButton!)
    expect(await screen.findByText('answer-b-after-retry')).toBeInTheDocument()
    expect(learnerBReads).toBe(2)
  })

  it('blocks same-tick duplicate score saves', async () => {
    const adjustment = deferred<Response>()
    let patchCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      if (init?.method === 'PATCH') {
        patchCount += 1
        return adjustment.promise
      }
      return gradingReadResponse(url.pathname, 300, 'answer-a')
    })

    renderSubmissionPage('/classrooms/30/exams/10/submissions/300')
    expect(await screen.findByText('answer-a')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } })
    const saveButton = scoreSaveButton()
    act(() => {
      saveButton.click()
      saveButton.click()
    })
    expect(patchCount).toBe(1)

    adjustment.resolve(success(submission(300, 'answer-a', 7)))
    await waitFor(() => expect(saveButton).not.toBeDisabled())
  })

  it('keeps learner B draft when its score save fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input)
      if (init?.method === 'PATCH') return failure('SCORE_SAVE_FAILED', 'score save failed', 500)
      const activeSubmissionId = url.pathname === '/api/exams/10/submissions/301' ? 301 : 300
      const answer = activeSubmissionId === 301 ? 'answer-b' : 'answer-a'
      return gradingReadResponse(url.pathname, activeSubmissionId, answer)
    })

    renderSubmissionPage('/classrooms/30/exams/10/submissions/300')
    expect(await screen.findByText('answer-a')).toBeInTheDocument()
    fireEvent.click(nextLearnerLink())
    expect(await screen.findByText('answer-b')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '6.25' } })
    fireEvent.click(scoreSaveButton())

    expect(await screen.findByText('score save failed')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(6.25)
  })
})

function renderSubmissionPage(path: string, includeRouteControl = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialUser={{ email: 'instructor@example.com', id: 1, name: 'Instructor', role: 'INSTRUCTOR' }}>
        <ToastProvider>
          {includeRouteControl ? <RouteNavigationButton /> : null}
          <Routes>
            <Route element={<InstructorExamSubmissionPage />} path="/classrooms/:classroomId/exams/:examId/submissions/:submissionId" />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function RouteNavigationButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/classrooms/30/exams/10/submissions/301')} type="button">Go to learner B</button>
}

function nextLearnerLink(): HTMLAnchorElement {
  const link = screen.getAllByRole('link').find((candidate) => candidate.getAttribute('href')?.endsWith('/submissions/301'))
  if (!(link instanceof HTMLAnchorElement)) throw new Error('next learner link not found')
  return link
}

function scoreSaveButton(): HTMLButtonElement {
  const button = screen.getByRole('spinbutton').closest('div')?.querySelector('button')
  if (!(button instanceof HTMLButtonElement)) throw new Error('score save button not found')
  return button
}

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
}

function gradingReadResponse(pathname: string, activeSubmissionId: number, answer: string): Response {
  if (pathname === '/api/exams/10') return success(exam())
  if (pathname === `/api/exams/10/submissions/${activeSubmissionId}`) {
    return success(submission(activeSubmissionId, answer, activeSubmissionId === 300 ? 9 : 8))
  }
  if (pathname === '/api/exams/10/submissions') {
    return success({
      items: [submissionSummary(300, 8, 'Learner A'), submissionSummary(301, 9, 'Learner B')],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
    })
  }
  if (pathname === '/api/classrooms/30/students') {
    return success({
      items: [
        { aiQuestionCountLast7Days: 0, email: 'a@example.com', joinedAt: '2026-08-01T00:00:00Z', name: 'Learner A', status: 'ACTIVE', studentId: 8 },
        { aiQuestionCountLast7Days: 0, email: 'b@example.com', joinedAt: '2026-08-01T00:00:00Z', name: 'Learner B', status: 'ACTIVE', studentId: 9 },
      ],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
    })
  }
  return new Response(null, { status: 404 })
}

function exam() {
  return {
    allowRetake: false,
    classroomId: 30,
    examId: 10,
    questionCount: 1,
    questions: [{ maxScore: 10, questionId: 'q1', questionText: 'Question 1', questionType: 'SHORT' }],
    status: 'PUBLISHED',
    title: 'State isolation exam',
    totalScore: 10,
  }
}

function submission(submissionId: number, answer: string, score: number) {
  return {
    attemptNo: 1,
    gradedAt: '2026-09-09T01:02:00Z',
    items: [{ answer, maxScore: 10, questionId: 'q1', score, verdict: 'CORRECT' }],
    maxScore: 10,
    normalizedScore: score * 10,
    score,
    status: 'GRADED',
    submissionId,
    submittedAt: '2026-09-09T01:01:12Z',
  }
}

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
  return new Response(JSON.stringify({ data, message: 'ok', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function failure(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, details: [], message }, success: false }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}
