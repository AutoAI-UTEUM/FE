import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UiActionsRenderer, type UiAction } from '../../features/sessions'
import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { SessionsPage } from './SessionsPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderSessionsPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('SessionsPage', () => {
  it('renders sessions returned by the API', async () => {
    renderSessionsPage()

    expect(
      await screen.findByRole('heading', { name: '학습 세션' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '학습 재개' })).toHaveAttribute(
      'href',
      '/sessions/100',
    )
  })

  it('deletes a session after user confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSessionsPage()

    const [deleteButton] = await screen.findAllByRole('button', {
      name: '시험 대비 요약.pdf 세션 삭제',
    })
    fireEvent.click(deleteButton)

    await waitFor(() =>
      expect(screen.queryByText('진행 중')).not.toBeInTheDocument(),
    )
    expect(window.confirm).toHaveBeenCalled()
  })

  it('keeps the session when deletion is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSessionsPage()

    const [deleteButton] = await screen.findAllByRole('button', {
      name: '시험 대비 요약.pdf 세션 삭제',
    })
    fireEvent.click(deleteButton)

    expect(screen.getByText('진행 중')).toBeInTheDocument()
  })
})

describe('UiActionsRenderer', () => {
  it('renders binary decision widgets and emits yes/no events', () => {
    const onEvent = vi.fn()
    const actions: UiAction[] = [
      {
        kind: 'BINARY_DECISION',
        label: '현재 페이지를 설명할까요?',
        noEvent: 'WAIT',
        yesEvent: 'EXPLAIN_CURRENT_PAGE',
      },
    ]

    render(
      <UiActionsRenderer
        actions={actions}
        onEvent={onEvent}
        onOpenDiagnosis={vi.fn()}
      />,
    )
    expect(screen.getByText('현재 페이지를 설명할까요?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '네' }))
    expect(onEvent).toHaveBeenCalledWith('EXPLAIN_CURRENT_PAGE', {
      action: actions[0],
      choice: 'yes',
    })

    fireEvent.click(screen.getByRole('button', { name: '아니요' }))
    expect(onEvent).toHaveBeenCalledWith('WAIT', {
      action: actions[0],
      choice: 'no',
    })
  })

  it('renders diagnosis widgets and move/wait actions', () => {
    const onEvent = vi.fn()
    const onOpenDiagnosis = vi.fn()
    const actions: UiAction[] = [
      { diagnosisId: '30', kind: 'DIAGNOSIS_QUESTION', label: '어디서 막혔나요?' },
      { kind: 'MOVE_NEXT_PAGE', label: '다음 페이지로', step: 1 },
      { durationMs: 800, kind: 'WAIT', label: '잠시 생각하기' },
    ]

    render(
      <UiActionsRenderer
        actions={actions}
        onEvent={onEvent}
        onOpenDiagnosis={onOpenDiagnosis}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '진단 답변 작성' }))
    expect(onOpenDiagnosis).toHaveBeenCalledWith('30')

    fireEvent.click(screen.getByRole('button', { name: '다음 페이지로' }))
    expect(onEvent).toHaveBeenCalledWith('MOVE_NEXT_PAGE', { action: actions[1] })

    expect(screen.getByRole('status')).toHaveTextContent('잠시 생각하기')
  })
})
