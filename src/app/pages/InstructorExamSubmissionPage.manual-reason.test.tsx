import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { InstructorExamSubmissionPage } from './InstructorExamSubmissionPage'

beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080') })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('instructor manual score reason contract', () => {
  it.each([undefined, null])('accepts legacy or null reason without inventing a saved reason (%s)', async (reason) => {
    mockApi({ reason })
    renderPage()
    expect(await screen.findByLabelText('1번 점수 변경 사유 (선택)')).toHaveValue('')
    expect(screen.queryByText('저장된 점수 변경 사유')).not.toBeInTheDocument()
  })

  it('preserves the existing reason when changing only the score, reloads it, and supports explicit clearing', async () => {
    const api = mockApi({ reason: '기존 검토 근거' })
    const view = renderPage()
    expect(await screen.findByLabelText('1번 점수 변경 사유 (선택)')).toHaveValue('기존 검토 근거')
    fireEvent.change(screen.getByLabelText('1번 점수'), { target: { value: '8' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.patches).toEqual([{ score: 8, reason: '기존 검토 근거' }]))
    await waitFor(() => expect(saveButton()).not.toBeDisabled())

    view.unmount()
    renderPage()
    expect(await screen.findByLabelText('1번 점수 변경 사유 (선택)')).toHaveValue('기존 검토 근거')
    expect(screen.getByLabelText('1번 점수')).toHaveValue(8)
    fireEvent.change(reasonInput(), { target: { value: '' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.patches.at(-1)).toEqual({ score: 8, reason: '' }))
    await waitFor(() => expect(screen.queryByText('저장된 점수 변경 사유')).not.toBeInTheDocument())
    expect(reasonInput()).toHaveValue('')
  })

  it('shows server-normalized multiline reason as text and keeps the previous saved value until success', async () => {
    const pending = deferred<Response>()
    const api = mockApi({ reason: '기존 사유', patch: () => pending.promise })
    renderPage()
    await screen.findByLabelText('1번 점수 변경 사유 (선택)')
    const reason = '  재검토\n<script>synthetic</script>  '
    fireEvent.change(reasonInput(), { target: { value: reason } })
    const save = saveButton()
    act(() => { save.click(); save.click() })
    expect(api.patches).toEqual([{ score: 9, reason }])
    expect(reasonInput()).toBeDisabled()
    expect(screen.getByLabelText('1번 점수')).toBeDisabled()
    expect(screen.getByText('기존 사유')).toBeInTheDocument()
    pending.resolve(success(submission('재검토\n<script>synthetic</script>', 9)))
    await waitFor(() => expect(reasonInput()).toHaveValue('재검토\n<script>synthetic</script>'))
    expect(screen.getByText(/synthetic<\/script>/, { selector: 'p' })).toHaveTextContent('재검토 <script>synthetic</script>')
    expect(document.querySelector('article script')).toBeNull()
  })

  it.each(['가'.repeat(500), '😀'.repeat(250)])('accepts the 500 UTF-16 unit boundary', async (reason) => {
    const api = mockApi({ reason: null })
    renderPage()
    await screen.findByLabelText('1번 점수 변경 사유 (선택)')
    fireEvent.change(reasonInput(), { target: { value: reason } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.patches).toEqual([{ score: 9, reason }]))
    await waitFor(() => expect(saveButton()).not.toBeDisabled())
    expect(reasonInput()).toHaveAttribute('maxlength', '500')
  })

  it.each(['가'.repeat(501), '😀'.repeat(251), ' '.repeat(501)])('rejects an oversized raw reason before any PATCH', async (reason) => {
    const api = mockApi({ reason: '기존 사유' })
    renderPage()
    await screen.findByLabelText('1번 점수 변경 사유 (선택)')
    fireEvent.change(reasonInput(), { target: { value: reason } })
    fireEvent.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('점수 변경 사유는 500자 이내로 입력하세요.')
    expect(api.patches).toEqual([])
    expect(screen.getByText('기존 사유')).toBeInTheDocument()
  })

  it('lets the server clear whitespace-only input and does not silently normalize nonbreaking spaces', async () => {
    const api = mockApi({ reason: '기존 사유' })
    renderPage()
    await screen.findByLabelText('1번 점수 변경 사유 (선택)')
    fireEvent.change(reasonInput(), { target: { value: ' \t\n ' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(reasonInput()).toHaveValue(''))
    expect(api.patches.at(-1)).toEqual({ score: 9, reason: ' \t\n ' })
    fireEvent.change(reasonInput(), { target: { value: '\u00a0' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(api.patches.at(-1)).toEqual({ score: 9, reason: '\u00a0' }))
    await waitFor(() => expect(saveButton()).not.toBeDisabled())
  })

  it.each([400, 403, 404, 409, 500, 'network'] as const)('keeps drafts and the saved reason after %s, and retries only on a new click', async (status) => {
    let requests = 0
    const api = mockApi({ reason: '저장된 이전 사유', patch: () => {
      requests++
      if (requests > 1) return Promise.resolve(success(submission('새 검토 근거', 8)))
      if (status === 'network') return Promise.reject(new TypeError('synthetic network failure'))
      return Promise.resolve(new Response(JSON.stringify({ success: false, error: { code: 'SCORE_SAVE_FAILED', message: '합성 저장 실패', details: [] } }), { status, headers: { 'Content-Type': 'application/json' } }))
    } })
    renderPage()
    await screen.findByLabelText('1번 점수 변경 사유 (선택)')
    fireEvent.change(screen.getByLabelText('1번 점수'), { target: { value: '8' } })
    fireEvent.change(reasonInput(), { target: { value: '새 검토 근거' } })
    fireEvent.click(saveButton())
    await screen.findByRole('alert')
    expect(api.patches).toEqual([{ score: 8, reason: '새 검토 근거' }])
    expect(reasonInput()).toHaveValue('새 검토 근거')
    expect(screen.getByLabelText('1번 점수')).toHaveValue(8)
    expect(screen.getByText('저장된 이전 사유')).toBeInTheDocument()
    expect(screen.queryByText('문항 점수를 저장했습니다.')).not.toBeInTheDocument()
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('저장된 이전 사유')).not.toBeInTheDocument())
    expect(api.patches).toHaveLength(2)
  })

  it('does not erase an unsaved draft in another question after saving one question', async () => {
    mockApi({ reason: null, secondQuestion: true })
    renderPage()
    await screen.findByLabelText('2번 점수 변경 사유 (선택)')
    fireEvent.change(screen.getByLabelText('2번 점수'), { target: { value: '7.25' } })
    fireEvent.change(screen.getByLabelText('2번 점수 변경 사유 (선택)'), { target: { value: '아직 저장하지 않은 둘째 문항' } })
    fireEvent.change(reasonInput(), { target: { value: '첫째 문항 검토' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.getByText('첫째 문항 검토', { selector: 'p' })).toBeInTheDocument())
    expect(screen.getByLabelText('2번 점수')).toHaveValue(7.25)
    expect(screen.getByLabelText('2번 점수 변경 사유 (선택)')).toHaveValue('아직 저장하지 않은 둘째 문항')
  })

  it('aborts an in-flight score and reason save on unmount and ignores its late response', async () => {
    const pending = deferred<Response>()
    const api = mockApi({ reason: '기존 사유', patch: () => pending.promise })
    const view = renderPage()
    await screen.findByLabelText('1번 점수 변경 사유 (선택)')
    fireEvent.change(reasonInput(), { target: { value: '종료 전 미완료 저장' } })
    fireEvent.click(saveButton())
    const patchCall = vi.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
    const signal = patchCall?.[1]?.signal
    expect(signal?.aborted).toBe(false)
    expect(api.patches).toEqual([{ score: 9, reason: '종료 전 미완료 저장' }])
    view.unmount()
    expect(signal?.aborted).toBe(true)
    renderPage()
    expect(await screen.findByLabelText('1번 점수 변경 사유 (선택)')).toHaveValue('기존 사유')
    pending.resolve(success(submission('늦은 이전 화면 사유', 8)))
    await act(async () => { await pending.promise })
    expect(reasonInput()).toHaveValue('기존 사유')
    expect(screen.queryByText('늦은 이전 화면 사유')).not.toBeInTheDocument()
    expect(screen.queryByText('문항 점수를 저장했습니다.')).not.toBeInTheDocument()
  })

  it.each(['SUBMITTED', 'GRADING_FAILED'])('does not offer reason editing while %s', async (status) => {
    mockApi({ reason: null, status })
    renderPage()
    await screen.findByText('synthetic answer')
    expect(screen.queryByLabelText('1번 점수 변경 사유 (선택)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '점수 저장' })).not.toBeInTheDocument()
  })
})

function renderPage() {
  return render(<MemoryRouter initialEntries={['/classrooms/30/exams/10/submissions/300']}><AuthProvider initialUser={{ email: 'instructor@example.com', id: 1, name: 'Instructor', role: 'INSTRUCTOR' }}><ToastProvider><Routes><Route element={<InstructorExamSubmissionPage />} path="/classrooms/:classroomId/exams/:examId/submissions/:submissionId" /></Routes></ToastProvider></AuthProvider></MemoryRouter>)
}
function reasonInput() { return screen.getByLabelText('1번 점수 변경 사유 (선택)') }
function saveButton() { return screen.getAllByRole('button', { name: '점수 저장' })[0] }
function mockApi({ reason, patch, secondQuestion = false, status = 'GRADED' }: { reason: string | null | undefined; patch?: () => Promise<Response>; secondQuestion?: boolean; status?: string }) {
  const patches: Array<{ score: number; reason: string }> = []
  let current = submission(reason, 9, secondQuestion, status)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { score: number; reason: string }
      patches.push(body)
      if (patch) return patch()
      current = submission(body.reason.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '') || null, body.score, secondQuestion, status)
      return success(current)
    }
    if (url.pathname === '/api/exams/10') return success({ examId: 10, classroomId: 30, title: 'Synthetic grading', status: 'PUBLISHED', totalScore: secondQuestion ? 20 : 10, questionCount: secondQuestion ? 2 : 1, questions: ['q1', ...(secondQuestion ? ['q2'] : [])].map(questionId => ({ questionId, maxScore: 10, questionText: questionId, questionType: 'SHORT' })) })
    if (url.pathname === '/api/exams/10/submissions/300') return success(current)
    if (url.pathname === '/api/exams/10/submissions' || url.pathname === '/api/classrooms/30/students') return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
    return new Response(null, { status: 404 })
  })
  return { patches }
}
function submission(manualScoreReason: string | null | undefined, score: number, secondQuestion = false, status = 'GRADED') {
  return { submissionId: 300, attemptNo: 1, status, submittedAt: '2026-10-13T10:00:00Z', score, maxScore: secondQuestion ? 20 : 10, items: [{ questionId: 'q1', answer: 'synthetic answer', maxScore: 10, score, manualScore: score, manualScoreReason }, ...(secondQuestion ? [{ questionId: 'q2', answer: 'second answer', maxScore: 10, score: 8, manualScore: 8, manualScoreReason: null }] : [])] }
}
function success(data: unknown) { return new Response(JSON.stringify({ success: true, message: 'ok', data }), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }
