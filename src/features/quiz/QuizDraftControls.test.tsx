import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readWorkspaceValue, workspaceKey, writeWorkspaceValue } from '../notes/workspaceStorage'
import { QuizDraftControls } from './QuizDraftControls'
import type { PublicQuiz } from './quizTypes'

const quiz: PublicQuiz = { id: '50', sessionId: '100', kind: 'SHORT', submitted: false, title: '확인', questions: [{ id: 'q1', kind: 'SHORT', prompt: '설명해 주세요' }] }
const key = workspaceKey('id:1', 'quiz-draft:50')
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('personal quiz drafts', () => {
  it('writes changed answers synchronously, restores explicitly after reload, and isolates accounts', async () => {
    const restore = vi.fn()
    const view = render(<QuizDraftControls answers={{}} onRestore={restore} owner="id:1" quiz={quiz} submitted={false} />)
    view.rerender(<QuizDraftControls answers={{ q1: '작성 중 답안' }} onRestore={restore} owner="id:1" quiz={quiz} submitted={false} />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('임시저장했습니다'))
    view.unmount()
    const next = render(<QuizDraftControls answers={{}} onRestore={restore} owner="id:1" quiz={quiz} submitted={false} />)
    expect(restore).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '저장한 답안 불러오기' }))
    expect(restore).toHaveBeenCalledWith({ q1: '작성 중 답안' })
    next.unmount()
    render(<QuizDraftControls answers={{}} onRestore={restore} owner="id:2" quiz={quiz} submitted={false} />)
    expect(screen.queryByRole('button', { name: '저장한 답안 불러오기' })).not.toBeInTheDocument()
  })

  it('ignores changed questions and expired data without treating it as a server result', () => {
    writeWorkspaceValue(key, { answers: { q1: 'old' }, signature: JSON.stringify(quiz.questions) })
    const view = render(<QuizDraftControls answers={{}} onRestore={vi.fn()} owner="id:1" quiz={{ ...quiz, questions: [{ ...quiz.questions[0], prompt: '변경한 문제' }] }} submitted={false} />)
    expect(screen.queryByText('저장한 답안 불러오기')).not.toBeInTheDocument()
    view.unmount()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
    expect(readWorkspaceValue(key)).toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('removes the answer draft only after successful submission is known', async () => {
    writeWorkspaceValue(key, { answers: { q1: 'draft' }, signature: JSON.stringify(quiz.questions) })
    const view = render(<QuizDraftControls answers={{ q1: 'draft' }} onRestore={vi.fn()} owner="id:1" quiz={quiz} submitted={false} />)
    expect(localStorage.getItem(key)).not.toBeNull()
    view.rerender(<QuizDraftControls answers={{ q1: 'draft' }} onRestore={vi.fn()} owner="id:1" quiz={quiz} submitted />)
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull())
    expect(screen.queryByRole('button', { name: '답안 임시저장' })).not.toBeInTheDocument()
  })

  it('reports storage denial and retains the input in the caller', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    const view = render(<QuizDraftControls answers={{}} onRestore={vi.fn()} owner="id:1" quiz={quiz} submitted={false} />)
    await act(async () => view.rerender(<QuizDraftControls answers={{ q1: 'keep me' }} onRestore={vi.fn()} owner="id:1" quiz={quiz} submitted={false} />))
    expect(screen.getByRole('status')).toHaveTextContent('임시저장 실패')
    fireEvent.click(screen.getByRole('button', { name: '답안 임시저장' }))
    expect(screen.getByRole('status')).toHaveTextContent('임시저장 실패')
  })
})
