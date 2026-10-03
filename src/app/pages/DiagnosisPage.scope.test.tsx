import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CorrectionMessage, PendingDiagnosis } from '../../features/diagnosis'
import { ApiClientError } from '../../shared/api'
import { DiagnosisPage } from './DiagnosisPage'

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 1 }, apiRequest: vi.fn() },
  restore: vi.fn(), submitAnswer: vi.fn(), submitTurn: vi.fn(),
}))
vi.mock('../../features/auth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../features/diagnosis', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../features/diagnosis')>(),
  createDiagnosisRepository: () => ({ restore: mocks.restore, submitAnswer: mocks.submitAnswer }),
}))
vi.mock('../../features/sessions', () => ({
  createSessionsRepository: () => ({ submitTurn: mocks.submitTurn }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function diagnosis(diagnosisId = '42', sessionId = '100'): PendingDiagnosis {
  return { diagnosisId, sessionId, prompt: `Answer ${diagnosisId}`, quizScore: 48, sourceQuestion: `Question ${sessionId}/${diagnosisId}` }
}
const correction: CorrectionMessage = {
  title: 'Correction A', summary: 'Summary A', focusAreas: [], nextQuestionPrompt: 'Next question',
}
function Navigation() {
  const navigate = useNavigate()
  return <>
    <button onClick={() => navigate('/sessions/200/diagnosis/43')}>Other session</button>
    <button onClick={() => navigate('/sessions/100/diagnosis/43')}>Other diagnosis</button>
    <button onClick={() => navigate('/sessions/100/diagnosis/42')}>Original diagnosis</button>
    <button onClick={() => navigate('/outside')}>Leave</button>
  </>
}
function Harness() {
  return <MemoryRouter initialEntries={['/sessions/100/diagnosis/42']}>
    <Navigation />
    <Routes>
      <Route path="/sessions/:sessionId/diagnosis/:diagnosisId" element={<DiagnosisPage />} />
      <Route path="/sessions/:sessionId" element={<p>Session destination</p>} />
      <Route path="/outside" element={<p>Outside</p>} />
    </Routes>
  </MemoryRouter>
}
function MissingParamsHarness() {
  return <MemoryRouter initialEntries={['/sessions/100/diagnosis']}>
    <DiagnosisPage />
  </MemoryRouter>
}
async function submitDraft() {
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'My diagnosis answer' } })
  fireEvent.click(screen.getByRole('button', { name: '진단 제출' }))
}

beforeEach(() => {
  mocks.auth.user = { id: 1 }
  mocks.restore.mockReset().mockImplementation(async (id: string, session: string) => diagnosis(id, session))
  mocks.submitAnswer.mockReset().mockResolvedValue(correction)
  mocks.submitTurn.mockReset().mockResolvedValue({ activeQuizId: '55' })
})
afterEach(cleanup)

describe('DiagnosisPage scope isolation', () => {
  it.each(['Other diagnosis', 'Other session'])('clears draft and submitted correction on %s navigation', async (destination) => {
    render(<Harness />)
    await submitDraft()
    await screen.findByRole('heading', { name: 'Correction A' })
    fireEvent.click(screen.getByRole('button', { name: destination }))
    const input = await screen.findByLabelText('Answer 43')
    expect(input).toHaveValue('')
    expect(input).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Correction A' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '진단 제출' })).toBeEnabled()
  })

  it('starts a fresh draft when the account changes at the same route', async () => {
    const view = render(<Harness />)
    await submitDraft()
    await screen.findByRole('heading', { name: 'Correction A' })
    mocks.auth.user = { id: 2 }
    view.rerender(<Harness />)
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Correction A' })).not.toBeInTheDocument()
  })

  it('ignores an old successful restore even when the transport does not honor abort', async () => {
    const old = deferred<PendingDiagnosis>()
    mocks.restore.mockImplementationOnce(() => old.promise)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Other session' }))
    await screen.findByText('Question 200/43')
    await act(async () => old.resolve(diagnosis()))
    expect(screen.getByText('Question 200/43')).toBeInTheDocument()
    expect(screen.queryByText('Question 100/42')).not.toBeInTheDocument()
    expect(mocks.restore.mock.calls[0][2].aborted).toBe(true)
  })

  it.each(['resolve', 'reject'] as const)('ignores stale submission %s while a new scope is submitting', async (outcome) => {
    const old = deferred<CorrectionMessage>()
    const current = deferred<CorrectionMessage>()
    mocks.submitAnswer.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise)
    render(<Harness />)
    await submitDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Other session' }))
    await screen.findByLabelText('Answer 43')
    await submitDraft()
    await act(async () => outcome === 'resolve' ? old.resolve(correction) : old.reject(new Error('Old failure')))
    expect(screen.getByRole('button', { name: '제출 중' })).toBeDisabled()
    expect(screen.queryByText('Old failure')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Correction A' })).not.toBeInTheDocument()
    await act(async () => current.resolve({ ...correction, title: 'Correction B' }))
    expect(await screen.findByRole('heading', { name: 'Correction B' })).toBeInTheDocument()
  })

  it('ignores pending retest navigation after leaving the diagnosis', async () => {
    const old = deferred<{ activeQuizId: string }>()
    mocks.submitTurn.mockImplementationOnce(() => old.promise)
    render(<Harness />)
    await submitDraft()
    fireEvent.click(await screen.findByRole('button', { name: 'OX' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await act(async () => old.resolve({ activeQuizId: '55' }))
    expect(screen.getByText('Outside')).toBeInTheDocument()
    expect(screen.queryByText('Session destination')).not.toBeInTheDocument()
  })

  it('hides the old draft immediately while a new diagnosis is loading and when returning', async () => {
    const next = deferred<PendingDiagnosis>()
    render(<Harness />)
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Unsaved answer A' } })
    mocks.restore.mockImplementationOnce(() => next.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Other session' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('진단 상태를 복원하는 중입니다.')).toBeInTheDocument()
    await act(async () => next.resolve(diagnosis('43', '200')))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Unsaved answer B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Original diagnosis' }))
    expect(await screen.findByRole('textbox')).toHaveValue('')
    expect(screen.getByText('Question 100/42')).toBeInTheDocument()
  })

  it('ignores a stale restore failure and supports retrying the current restore', async () => {
    const old = deferred<PendingDiagnosis>()
    mocks.restore.mockImplementationOnce(() => old.promise).mockRejectedValueOnce(new Error('Current load failed'))
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Other session' }))
    await screen.findByText('Current load failed')
    await act(async () => old.reject(new Error('Old load failed')))
    expect(screen.getByText('Current load failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByLabelText('Answer 43')).toHaveValue('')
    expect(screen.getByText('Question 200/43')).toBeInTheDocument()
  })

  it.each(['resolve', 'reject'] as const)('ignores a stale submission %s after account change', async (outcome) => {
    const old = deferred<CorrectionMessage>()
    mocks.submitAnswer.mockImplementationOnce(() => old.promise)
    const view = render(<Harness />)
    await submitDraft()
    mocks.auth.user = { id: 2 }
    view.rerender(<Harness />)
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(2))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Account B draft' } })
    await act(async () => outcome === 'resolve' ? old.resolve(correction) : old.reject(new Error('Old failure')))
    expect(screen.getByRole('textbox')).toHaveValue('Account B draft')
    expect(screen.getByRole('button', { name: '진단 제출' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Correction A' })).not.toBeInTheDocument()
    expect(screen.queryByText('Old failure')).not.toBeInTheDocument()
    expect(mocks.submitAnswer.mock.calls[0][2].aborted).toBe(true)
  })

  it.each(['resolve', 'reject'] as const)('ignores stale retest %s while the next diagnosis is active', async (outcome) => {
    const old = deferred<{ activeQuizId: string }>()
    mocks.submitTurn.mockImplementationOnce(() => old.promise)
    render(<Harness />)
    await submitDraft()
    fireEvent.click(await screen.findByRole('button', { name: 'OX' }))
    fireEvent.click(screen.getByRole('button', { name: 'Other session' }))
    await screen.findByLabelText('Answer 43')
    await act(async () => outcome === 'resolve' ? old.resolve({ activeQuizId: '55' }) : old.reject(new Error('Old retest failure')))
    expect(screen.getByText('Question 200/43')).toBeInTheDocument()
    expect(screen.queryByText('Old retest failure')).not.toBeInTheDocument()
    expect(screen.queryByText('Session destination')).not.toBeInTheDocument()
    expect(mocks.submitTurn.mock.calls[0][2].aborted).toBe(true)
  })

  it('retains the same-scope draft on failure and allows a successful retry', async () => {
    mocks.submitAnswer.mockRejectedValueOnce(new Error('Save failed'))
    render(<Harness />)
    await submitDraft()
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByRole('textbox')).toHaveValue('My diagnosis answer')
    fireEvent.click(screen.getByRole('button', { name: '진단 제출' }))
    await screen.findByRole('heading', { name: 'Correction A' })
    expect(mocks.submitAnswer).toHaveBeenCalledTimes(2)
  })

  it('guards repeated submissions including direct form events after success', async () => {
    const pending = deferred<CorrectionMessage>()
    mocks.submitAnswer.mockImplementationOnce(() => pending.promise)
    render(<Harness />)
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'My diagnosis answer' } })
    const form = input.closest('form')!
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(mocks.submitAnswer).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(correction))
    fireEvent.submit(form)
    expect(mocks.submitAnswer).toHaveBeenCalledTimes(1)
  })

  it('guards repeated retests and allows retry after a failed retest', async () => {
    const pending = deferred<{ activeQuizId: string }>()
    mocks.submitTurn.mockImplementationOnce(() => pending.promise)
    render(<Harness />)
    await submitDraft()
    const button = await screen.findByRole('button', { name: 'OX' })
    act(() => { fireEvent.click(button); fireEvent.click(button) })
    expect(mocks.submitTurn).toHaveBeenCalledTimes(1)
    await act(async () => pending.reject(new Error('Retest failed')))
    fireEvent.click(screen.getByRole('button', { name: 'OX' }))
    expect(await screen.findByText('Session destination')).toBeInTheDocument()
    expect(mocks.submitTurn).toHaveBeenCalledTimes(2)
  })

  it('keeps the submitted answer and correction when a retest has no active quiz and retries once', async () => {
    mocks.submitTurn.mockResolvedValueOnce({ activeQuizId: undefined })
    render(<Harness />)
    await submitDraft()
    await screen.findByRole('heading', { name: 'Correction A' })

    fireEvent.click(screen.getByRole('button', { name: 'OX' }))

    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Correction A' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('My diagnosis answer')
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'OX' })).toBeEnabled()
    expect(mocks.submitTurn).toHaveBeenCalledTimes(1)
    expect(mocks.submitTurn).toHaveBeenNthCalledWith(
      1,
      '100',
      expect.objectContaining({
        eventType: 'QUIZ_TYPE_SELECTED',
        payload: { quizType: 'OX' },
        requestId: expect.any(String),
      }),
      expect.any(AbortSignal),
    )

    fireEvent.click(screen.getByRole('button', { name: 'OX' }))

    expect(await screen.findByText('Session destination')).toBeInTheDocument()
    expect(mocks.submitTurn).toHaveBeenCalledTimes(2)
  })

  it.each([
    { code: 'RETEST_CONFLICT', message: 'Retest conflict', status: 409 },
    { code: 'RATE_LIMITED', message: 'Retest rate limited', status: 429 },
    { code: 'SERVICE_UNAVAILABLE', message: 'Retest unavailable', status: 503 },
  ])('preserves the correction and retries after the $status retest contract', async ({ code, message, status }) => {
    mocks.submitTurn.mockRejectedValueOnce(new ApiClientError({ code, message, status }))
    render(<Harness />)
    await submitDraft()
    await screen.findByRole('heading', { name: 'Correction A' })

    fireEvent.click(screen.getByRole('button', { name: '객관식' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { name: 'Correction A' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('My diagnosis answer')
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: '객관식' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '객관식' }))

    expect(await screen.findByText('Session destination')).toBeInTheDocument()
    expect(mocks.submitTurn).toHaveBeenCalledTimes(2)
  })

  it('offers a non-mutating session exit when restore returns null', async () => {
    mocks.restore.mockResolvedValueOnce(null)
    render(<Harness />)

    expect(await screen.findByRole('link')).toHaveAttribute('href', '/sessions/100')
    expect(mocks.submitAnswer).not.toHaveBeenCalled()
    expect(mocks.submitTurn).not.toHaveBeenCalled()
  })

  it('offers a non-mutating classroom exit when route identifiers are missing', async () => {
    render(<MissingParamsHarness />)

    expect(await screen.findByRole('link')).toHaveAttribute('href', '/classrooms')
    expect(mocks.restore).not.toHaveBeenCalled()
    expect(mocks.submitAnswer).not.toHaveBeenCalled()
    expect(mocks.submitTurn).not.toHaveBeenCalled()
  })
})
