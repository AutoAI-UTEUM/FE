import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

import { AuthProvider, useAuth } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ExamDetailPage } from './ExamDetailPage'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  vi.stubEnv('VITE_API_CAPABILITIES', 'exam-attempt-drafts,exam-learner-regrade')
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

describe('ExamDetailPage instructor scope isolation', () => {
  it('keeps a denied B exam scoped when the aborted A GET resolves late', async () => {
    const examA = deferred<Response>()
    const examB = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return examA.promise
      if (request.method === 'GET' && url.pathname === '/api/exams/20') return examB.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Open exam B' }))
    await act(async () => { examB.resolve(apiFailure('ACCESS_DENIED', 403, 'Exam B denied')) })
    expect(await screen.findByText('Exam B denied')).toBeInTheDocument()

    await act(async () => { examA.resolve(success(instructorExamFixture(10, 'Exam A'))) })
    expect(screen.getByText('Exam B denied')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Exam A' })).not.toBeInTheDocument()
  })

  it('does not carry an unsaved instructor draft from exam A into exam B', async () => {
    const examB = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A'))
      if (request.method === 'GET' && url.pathname === '/api/exams/20') return examB.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const details = (await screen.findByText('Description A')).closest('section')
    expect(details).not.toBeNull()
    fireEvent.click(within(details!).getAllByRole('button')[1])
    fireEvent.change(screen.getByDisplayValue('Exam A'), { target: { value: 'Unsaved exam A' } })

    fireEvent.click(screen.getByRole('button', { name: 'Open exam B' }))
    expect(screen.queryByDisplayValue('Unsaved exam A')).not.toBeInTheDocument()
    await act(async () => { examB.resolve(success(instructorExamFixture(20, 'Exam B'))) })
    expect(await screen.findByRole('heading', { name: 'Exam B' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Unsaved exam A')).not.toBeInTheDocument()
  })

  it('clears exam A submissions while exam B submissions are pending', async () => {
    const examBSubmissions = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A', 'PUBLISHED'))
      if (request.method === 'GET' && url.pathname === '/api/exams/20') return success(instructorExamFixture(20, 'Exam B', 'PUBLISHED'))
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions') return success(paged([instructorSubmissionFixture('Student A')]))
      if (request.method === 'GET' && url.pathname === '/api/exams/20/submissions') return examBSubmissions.promise
      if (request.method === 'GET' && url.pathname === '/api/classrooms/30/students') return success(paged([]))
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()
    expect((await screen.findAllByText('Student A')).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Open exam B' }))
    expect(await screen.findByRole('heading', { name: 'Exam B' })).toBeInTheDocument()
    expect(screen.queryAllByText('Student A')).toHaveLength(0)

    await act(async () => { examBSubmissions.resolve(success(paged([instructorSubmissionFixture('Student B')]))) })
    expect((await screen.findAllByText('Student B')).length).toBeGreaterThan(0)
  })

  it('ignores a late exam A save after exam B has loaded', async () => {
    const saveA = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A'))
      if (request.method === 'GET' && url.pathname === '/api/exams/20') return success(instructorExamFixture(20, 'Exam B'))
      if (request.method === 'PATCH' && url.pathname === '/api/exams/10') return saveA.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const details = (await screen.findByText('Description A')).closest('section')
    fireEvent.click(within(details!).getAllByRole('button')[1])
    fireEvent.change(screen.getByDisplayValue('Exam A'), { target: { value: 'Saved exam A' } })
    fireEvent.submit(screen.getByDisplayValue('Saved exam A').closest('form')!)
    await waitFor(() => expect(requestCount('PATCH', '/api/exams/10')).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: 'Open exam B' }))
    expect(await screen.findByRole('heading', { name: 'Exam B' })).toBeInTheDocument()
    await act(async () => { saveA.resolve(success(instructorExamFixture(10, 'Saved exam A'))) })
    expect(screen.getByRole('heading', { name: 'Exam B' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Saved exam A' })).not.toBeInTheDocument()
  })

  it('does not apply a late exam A regrade to exam B submissions', async () => {
    const regradeA = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A', 'PUBLISHED'))
      if (request.method === 'GET' && url.pathname === '/api/exams/20') return success(instructorExamFixture(20, 'Exam B', 'PUBLISHED'))
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions') return success(paged([instructorSubmissionFixture('Student A')]))
      if (request.method === 'GET' && url.pathname === '/api/exams/20/submissions') return success(paged([instructorSubmissionFixture('Student B')]))
      if (request.method === 'GET' && url.pathname === '/api/classrooms/30/students') return success(paged([]))
      if (request.method === 'POST' && url.pathname === '/api/exams/10/submissions/300/regrade') return regradeA.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const studentARow = (await screen.findAllByText('Student A'))[0].closest('tr')
    fireEvent.click(within(studentARow!).getByRole('button'))
    await waitFor(() => expect(requestCount('POST', '/api/exams/10/submissions/300/regrade')).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: 'Open exam B' }))
    const studentBRow = (await screen.findAllByText('Student B'))[0].closest('tr')
    expect(within(studentBRow!).getByRole('button')).toBeEnabled()
    await act(async () => { regradeA.resolve(success({ ...failedSubmissionFixture, gradedAt: '2026-10-03T01:00:00Z', maxScore: 10, normalizedScore: 100, score: 10, status: 'GRADED' })) })
    expect(within(studentBRow!).getByRole('button')).toBeEnabled()
  })

  it('does not let an account A publish result replace account B or start B follow-up requests', async () => {
    const publishA = deferred<Response>()
    let examGets = 0
    const publishSignals: AbortSignal[] = []
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') {
        examGets += 1
        return success(instructorExamFixture(10, examGets === 1 ? 'Account A exam' : 'Account B exam'))
      }
      if (request.method === 'POST' && url.pathname === '/api/exams/10/publish') {
        publishSignals.push(request.signal)
        return publishA.promise
      }
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const details = (await screen.findByText('Description A')).closest('section')
    fireEvent.click(within(details!).getAllByRole('button')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }))
    expect(await screen.findByRole('heading', { name: 'Account B exam' })).toBeInTheDocument()
    expect(publishSignals[0]?.aborted).toBe(true)

    await act(async () => { publishA.resolve(success(instructorExamFixture(10, 'Account A published', 'PUBLISHED'))) })
    expect(screen.getByRole('heading', { name: 'Account B exam' })).toBeInTheDocument()
    expect(requestCount('GET', '/api/exams/10/submissions')).toBe(0)
  })

  it.each([
    ['close', 'PUBLISHED', 0, 'POST', '/api/exams/10/close'],
    ['delete', 'DRAFT', 3, 'DELETE', '/api/exams/10'],
  ])('ignores a late exam A %s result after exam B has loaded', async (_action, status, buttonIndex, method, actionPath) => {
    const actionA = deferred<Response>()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A', status))
      if (request.method === 'GET' && url.pathname === '/api/exams/20') return success(instructorExamFixture(20, 'Exam B'))
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions') return success(paged([]))
      if (request.method === 'GET' && url.pathname === '/api/classrooms/30/students') return success(paged([]))
      if (request.method === method && url.pathname === actionPath) return actionA.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const details = (await screen.findByText('Description A')).closest('section')
    fireEvent.click(within(details!).getAllByRole('button')[buttonIndex])
    await waitFor(() => expect(requestCount(method, actionPath)).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Open exam B' }))
    expect(await screen.findByRole('heading', { name: 'Exam B' })).toBeInTheDocument()

    await act(async () => {
      actionA.resolve(method === 'DELETE' ? success(null) : success(instructorExamFixture(10, 'Exam A closed', 'CLOSED')))
    })
    expect(screen.getByRole('heading', { name: 'Exam B' })).toBeInTheDocument()
  })

  it('coalesces publish clicks fired in the same tick', async () => {
    const publish = deferred<Response>()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A'))
      if (request.method === 'POST' && url.pathname === '/api/exams/10/publish') return publish.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const details = (await screen.findByText('Description A')).closest('section')
    const publishButton = within(details!).getAllByRole('button')[2]
    act(() => { publishButton.click(); publishButton.click() })
    expect(requestCount('POST', '/api/exams/10/publish')).toBe(1)
    await act(async () => { publish.resolve(success(instructorExamFixture(10, 'Exam A', 'PUBLISHED'))) })
  })

  it('coalesces instructor saves fired in the same tick', async () => {
    const save = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A'))
      if (request.method === 'PATCH' && url.pathname === '/api/exams/10') return save.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const details = (await screen.findByText('Description A')).closest('section')
    fireEvent.click(within(details!).getAllByRole('button')[1])
    const form = screen.getByDisplayValue('Exam A').closest('form')!
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(requestCount('PATCH', '/api/exams/10')).toBe(1)
    await act(async () => { save.resolve(success(instructorExamFixture(10, 'Exam A'))) })
  })

  it('coalesces instructor regrades fired in the same tick', async () => {
    const regrade = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success(instructorExamFixture(10, 'Exam A', 'PUBLISHED'))
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions') return success(paged([instructorSubmissionFixture('Student A')]))
      if (request.method === 'GET' && url.pathname === '/api/classrooms/30/students') return success(paged([]))
      if (request.method === 'POST' && url.pathname === '/api/exams/10/submissions/300/regrade') return regrade.promise
      return new Response(null, { status: 404 })
    })
    renderInstructorScope()

    const studentRow = (await screen.findAllByText('Student A'))[0].closest('tr')!
    const regradeButton = within(studentRow).getByRole('button')
    act(() => { regradeButton.click(); regradeButton.click() })
    expect(requestCount('POST', '/api/exams/10/submissions/300/regrade')).toBe(1)
    await act(async () => { regrade.resolve(success({ ...failedSubmissionFixture, status: 'SUBMITTED' })) })
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

  it('omits Unicode-only unanswered values and reuses the request id after rejection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const submittedBodies: Array<{ answers: unknown[]; requestId: string }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
      if (method === 'GET' && url.pathname === '/api/exams/10') return success(learnerExamFixture)
      if (method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-09-09T00:58:50Z' })
      if (method === 'POST' && url.pathname === '/api/exams/10/submissions') {
        const body = JSON.parse(String(init?.body)) as { answers: unknown[]; requestId: string }
        submittedBodies.push(body)
        if (submittedBodies.length === 1) return apiFailure('INVALID_EXAM_ANSWER', 400, '답안을 확인해 주세요.')
        return success({
          attemptNo: 1,
          items: [{ answer: null, maxScore: 10, questionId: 'q1', score: 0, verdict: 'WRONG' }],
          maxScore: 10,
          normalizedScore: 0,
          reviewAvailable: false,
          score: 0,
          status: 'GRADED',
          submissionId: 300,
          submittedAt: '2026-09-09T01:00:00Z',
        })
      }
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    const answer = await screen.findByPlaceholderText('답안을 입력하세요')
    fireEvent.change(answer, { target: { value: '\u3000\u202f' } })
    fireEvent.click(screen.getByRole('button', { name: '시험 제출' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('답안을 확인해 주세요.')
    expect(answer).toHaveValue('\u3000\u202f')
    expect(sessionStorage.getItem('exam-draft:10:8')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '시험 제출' }))

    expect(await screen.findByRole('heading', { name: '시험 제출 및 채점이 완료되었습니다' })).toBeInTheDocument()
    expect(submittedBodies).toHaveLength(2)
    expect(submittedBodies[0]?.answers).toEqual([])
    expect(submittedBodies[1]?.answers).toEqual([])
    expect(submittedBodies[1]?.requestId).toBe(submittedBodies[0]?.requestId)
  })

  it('hides failed PUBLISHED grading data and regrades the same saved submission once', async () => {
    let resolveRegrade: ((response: Response) => void) | undefined
    const regradeResponse = new Promise<Response>((resolve) => { resolveRegrade = resolve })
    let regradeCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        allowRetake: false,
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        submittable: false,
      })
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions/me') return success(failedSubmissionFixture)
      if (request.method === 'POST' && url.pathname === '/api/exams/10/submissions/me/regrade') {
        regradeCalls += 1
        expect(init?.body).toBeUndefined()
        return regradeResponse
      }
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    expect(await screen.findByRole('heading', { name: '시험 제출은 완료되었지만 채점하지 못했습니다' })).toBeInTheDocument()
    expect(screen.getByText('제출한 답안').closest('section')).toHaveTextContent('스택')
    expect(screen.queryByText('노출되면 안 되는 피드백')).not.toBeInTheDocument()
    expect(screen.queryByText('후입선출')).not.toBeInTheDocument()
    expect(screen.queryByText('0/10')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새로 응시' })).not.toBeInTheDocument()

    const regradeButton = screen.getByRole('button', { name: '저장 답안 재채점' })
    fireEvent.click(regradeButton)
    fireEvent.click(regradeButton)
    expect(regradeCalls).toBe(1)
    expect(regradeButton).toBeDisabled()
    await act(async () => {
      resolveRegrade?.(success({ ...failedSubmissionFixture, status: 'SUBMITTED' }))
      await Promise.resolve()
    })
    expect(await screen.findByRole('heading', { name: '시험 제출이 완료되었습니다' })).toBeInTheDocument()
  })

  it('renders a completed result immediately when learner regrade returns GRADED', async () => {
    let regradeCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        submittable: false,
      })
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions/me') return success(failedSubmissionFixture)
      if (request.method === 'POST' && url.pathname === '/api/exams/10/submissions/me/regrade') {
        regradeCalls += 1
        return success({
          ...failedSubmissionFixture,
          gradedAt: '2026-10-01T10:00:00Z',
          items: [{ ...failedSubmissionFixture.items[0], feedback: null, score: 10, verdict: 'CORRECT' }],
          maxScore: 10,
          normalizedScore: 100,
          score: 10,
          status: 'GRADED',
        })
      }
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    fireEvent.click(await screen.findByRole('button', { name: '저장 답안 재채점' }))

    expect(await screen.findByRole('heading', { name: '시험 제출 및 채점이 완료되었습니다' })).toBeInTheDocument()
    expect(screen.getByText('획득 점수').closest('div')).toHaveTextContent('10/10점')
    expect(screen.queryByRole('button', { name: '저장 답안 재채점' })).not.toBeInTheDocument()
    expect(regradeCalls).toBe(1)
  })

  it('shows only stored partial results for a CLOSED failed submission', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        status: 'CLOSED',
        submittable: false,
      })
      if (url.pathname === '/api/exams/10/submissions/me') return success({ ...failedSubmissionFixture, reviewAvailable: true })
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    expect(await screen.findByText('종료된 시험의 저장된 부분 채점 결과만 표시합니다.')).toBeInTheDocument()
    expect(screen.getByText('부분 정답')).toBeInTheDocument()
    expect(screen.getByText('5/10')).toBeInTheDocument()
    expect(screen.getByText('노출되면 안 되는 피드백')).toBeInTheDocument()
    expect(screen.getByText('후입선출')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장 답안 재채점' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새로 응시' })).not.toBeInTheDocument()
  })

  it('keeps regrade separate from a new retake and trusts PUBLISHED over a past dueAt', async () => {
    const requested: Array<{ method: string; path: string }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      requested.push({ method: request.method, path: url.pathname })
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        allowRetake: true,
        dueAt: '2020-01-01T00:00:00Z',
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        status: 'PUBLISHED',
        submittable: true,
      })
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions/me') return success(failedSubmissionFixture)
      if (request.method === 'POST' && url.pathname === '/api/exams/10/attempts/start') return success({ startedAt: '2026-10-01T00:00:00Z' })
      if (request.method === 'GET' && url.pathname === '/api/exams/10/attempts/draft') return new Response(null, { status: 204 })
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    expect(await screen.findByRole('button', { name: '저장 답안 재채점' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '새로 응시' }))

    expect(await screen.findByPlaceholderText('답안을 입력하세요')).toBeInTheDocument()
    await waitFor(() => expect(requested).toContainEqual({ method: 'POST', path: '/api/exams/10/attempts/start' }))
    expect(screen.queryByRole('button', { name: '저장 답안 재채점' })).not.toBeInTheDocument()
  })

  it('does not expose learner regrade when the deployment capability is disabled', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'exam-attempt-drafts')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        submittable: false,
      })
      if (url.pathname === '/api/exams/10/submissions/me') return success(failedSubmissionFixture)
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    expect(await screen.findByRole('heading', { name: '시험 제출은 완료되었지만 채점하지 못했습니다' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장 답안 재채점' })).not.toBeInTheDocument()
  })

  it('checks the current submission once after a regrade network failure without resubmitting', async () => {
    let submissionGets = 0
    let regradePosts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        submittable: false,
      })
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions/me') {
        submissionGets += 1
        return success(failedSubmissionFixture)
      }
      if (request.method === 'POST' && url.pathname === '/api/exams/10/submissions/me/regrade') {
        regradePosts += 1
        throw new TypeError('network unavailable')
      }
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    fireEvent.click(await screen.findByRole('button', { name: '저장 답안 재채점' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('재채점 요청 상태를 확인하지 못했습니다.')
    expect(regradePosts).toBe(1)
    expect(submissionGets).toBe(2)
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).endsWith('/api/exams/10/submissions'))).toHaveLength(0)
  })

  it('clears the failed result when regrade is denied for the current role', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/exams/10') return success({
        ...learnerExamFixture,
        latestSubmission: { attemptNo: 1, maxScore: null, normalizedScore: null, score: null, status: 'GRADING_FAILED', submissionId: 300 },
        submittable: false,
      })
      if (request.method === 'GET' && url.pathname === '/api/exams/10/submissions/me') return success(failedSubmissionFixture)
      if (request.method === 'POST' && url.pathname === '/api/exams/10/submissions/me/regrade') return apiFailure('ACCESS_DENIED', 403, '권한이 없습니다.')
      return new Response(null, { status: 404 })
    })
    renderLearnerExam()

    fireEvent.click(await screen.findByRole('button', { name: '저장 답안 재채점' }))

    expect(await screen.findByRole('heading', { name: '시험에 접근할 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByText('현재 계정 역할로는 이 시험 기능을 사용할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText('노출되면 안 되는 피드백')).not.toBeInTheDocument()
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

function renderInstructorScope() {
  return render(
    <MemoryRouter initialEntries={['/classrooms/30/exams/10']}>
      <AuthProvider initialUser={{ email: 'instructor-a@example.com', id: 7, name: 'Instructor A', role: 'INSTRUCTOR' }}>
        <ToastProvider>
          <InstructorScopeHarness />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function InstructorScopeHarness() {
  const navigate = useNavigate()
  const { updateUser } = useAuth()
  return <>
    <button onClick={() => navigate('/classrooms/30/exams/20')} type="button">Open exam B</button>
    <button onClick={() => updateUser({ email: 'instructor-b@example.com', id: 8, name: 'Instructor B', role: 'INSTRUCTOR' })} type="button">Switch account</button>
    <Routes><Route element={<ExamDetailPage />} path="/classrooms/:classroomId/exams/:examId" /></Routes>
  </>
}

function instructorExamFixture(examId: number, title: string, status = 'DRAFT') {
  return {
    allowRetake: false,
    classroomId: 30,
    description: examId === 10 ? 'Description A' : 'Description B',
    examId,
    questionCount: 1,
    questions: [{ maxScore: 10, questionId: `q-${examId}`, questionText: `Question ${examId}`, questionType: 'SHORT', referenceAnswer: 'Answer' }],
    status,
    title,
    totalScore: 10,
    weekNumber: 4,
  }
}

function instructorSubmissionFixture(userName: string) {
  return {
    attemptCount: 1,
    attemptNo: 1,
    maxScore: null,
    normalizedScore: null,
    score: null,
    status: 'GRADING_FAILED',
    submissionId: 300,
    submittedAt: '2026-10-03T00:00:00Z',
    userId: 9,
    userName,
  }
}

function paged(items: unknown[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: items.length > 0 ? 1 : 0 }
}

function requestCount(method: string, path: string) {
  return vi.mocked(globalThis.fetch).mock.calls.filter(([input, init]) => {
    const request = new Request(input, init)
    return request.method === method && new URL(request.url).pathname === path
  }).length
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
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

const failedSubmissionFixture = {
  attemptNo: 1,
  gradedAt: null,
  items: [{
    answer: '스택',
    correctAnswer: '후입선출',
    explanation: '스택은 후입선출 구조입니다.',
    feedback: '노출되면 안 되는 피드백',
    maxScore: 10,
    questionId: 'q1',
    score: 5,
    verdict: 'PARTIAL',
  }],
  maxScore: null,
  normalizedScore: null,
  reviewAvailable: false,
  score: null,
  status: 'GRADING_FAILED',
  submissionId: 300,
  submittedAt: '2026-09-09T01:00:00Z',
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function apiFailure(code: string, status: number, message: string): Response {
  return new Response(JSON.stringify({
    error: { code, details: [], message },
    success: false,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}
