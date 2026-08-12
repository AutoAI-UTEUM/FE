import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { rememberClassroomId } from '../../features/classrooms'
import { SessionDetailPage } from './SessionDetailPage'

beforeEach(() => {
  installApiFixtureServer()
  rememberClassroomId('12')
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1600,
  })
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderSessionDetail(path = '/sessions/100') {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/quizzes/:quizId" element={<p>퀴즈 화면</p>} />
          <Route
            path="/sessions/:sessionId/diagnosis/:diagnosisId"
            element={<p>진단 화면</p>}
          />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('SessionDetailPage', () => {
  it('returns to the remembered classroom week page', async () => {
    rememberClassroomId('12')
    renderSessionDetail()

    expect(
      await screen.findByRole('link', { name: '주차 페이지로' }),
    ).toHaveAttribute('href', '/classrooms/12')
  })

  it('closes and restores the resource list', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '자료 목록 닫기' }))
    expect(screen.queryByRole('link', { name: '주차 페이지로' })).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '자료 목록' }, { timeout: 5_000 }))
    expect(screen.getByRole('link', { name: '주차 페이지로' })).toBeInTheDocument()
  })

  it('reflects the page confirmed by a chat turn in the visible viewer', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '다음 페이지로 이동해 주세요.' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' }),
    ).toBeInTheDocument()
  })

  it('moves the viewer before explaining the next page from a typed prompt', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '다음 페이지를 설명해 주세요.' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.'),
    ).toBeInTheDocument()
  })

  it('updates pages only after the page API succeeds', async () => {
    renderSessionDetail()

    expect(
      await screen.findByRole(
        'progressbar',
        { name: '학습 진행률 1 / 5쪽' },
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: '학습 진행률 2 / 5쪽' }),
      ).toBeInTheDocument(),
    )
    expect(
      await screen.findByText('현재 페이지를 설명할까요?'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '목차' }))
    fireEvent.click(screen.getByRole('button', { name: '4쪽으로 이동' }))
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: '학습 진행률 4 / 5쪽' }),
      ).toBeInTheDocument(),
    )
  })

  it('exposes a keyboard-adjustable divider for the PDF and chat panels', async () => {
    renderSessionDetail()

    await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })
    const separator = screen.getByRole('separator', { name: 'PDF와 AI 채팅 너비 조절' })
    expect(separator).not.toHaveAttribute('aria-valuenow')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '633')

    fireEvent.doubleClick(separator)
    expect(separator).not.toHaveAttribute('aria-valuenow')
  })

  it('renders a session 404 state', async () => {
    renderSessionDetail('/sessions/999')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '세션을 찾을 수 없습니다.',
    )
  })

  it('runs an explain turn from the restored widget and shows the AI message', async () => {
    renderSessionDetail()

    expect(
      await screen.findByText('현재 페이지를 설명할까요?'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '네' }))

    expect(
      await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('퀴즈를 진행할까요?')).toBeInTheDocument()
  })

  it('opens the generated quiz inside the PDF workspace and returns to the PDF', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')

    fireEvent.click(screen.getByRole('button', { name: '네' }))
    expect(
      await screen.findByText('어떤 유형의 퀴즈를 풀까요?'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '객관식' }))
    expect(await screen.findByRole('button', { name: 'PDF로 돌아가기' })).toBeInTheDocument()
    expect(await screen.findByText('문항 1 / 2 · 답변 0 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PDF로 돌아가기' }))
    expect(
      await screen.findByRole('progressbar', { name: '학습 진행률 1 / 5쪽' }),
    ).toBeInTheDocument()
  })

  it('automatically restores a quiz when the session state is QUIZ_READY', async () => {
    renderSessionDetail('/sessions/103')

    expect(await screen.findByRole('button', { name: 'PDF로 돌아가기' })).toBeInTheDocument()
    expect(await screen.findByText('문항 1 / 2 · 답변 0 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'PDF로 돌아가기' }))
    expect(await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeInTheDocument()
  })

  it('groups current-classroom materials and quizzes by week', async () => {
    renderSessionDetail()

    const firstWeekLabel = await screen.findByText('핵심 개념')
    const secondWeekLabel = screen.getByText('심화 학습')
    expect(
      firstWeekLabel.compareDocumentPosition(secondWeekLabel)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('1주차')).toBeInTheDocument()
    expect(screen.getByText('2주차')).toBeInTheDocument()
    expect(screen.getByText('1주차')).toHaveClass('whitespace-nowrap')
    expect(screen.queryByText('8.3 - 8.9')).not.toBeInTheDocument()
    expect(screen.queryByText('8.10 - 8.16')).not.toBeInTheDocument()
    expect(screen.getAllByText('시험 대비 요약.pdf')).toHaveLength(2)
    const longMaterialTitle = screen.getByText('강의 노트 5주차.pdf')
    expect(longMaterialTitle).toHaveClass(
      'overflow-hidden',
      'text-ellipsis',
      'whitespace-nowrap',
    )
    expect(longMaterialTitle).toHaveAttribute(
      'title',
      '강의 노트 5주차.pdf',
    )
    const materialLink = longMaterialTitle.closest('a')
    const materialListItem = materialLink?.closest('li')
    const materialList = materialListItem?.parentElement
    const materialSection = materialList?.parentElement
    const resourcePanel = longMaterialTitle.closest('aside')
    expect(materialLink).toHaveClass(
      'min-w-0',
      'w-full',
      'max-w-full',
      'overflow-hidden',
    )
    expect(materialListItem).toHaveClass('min-w-0', 'w-full', 'max-w-full')
    expect(materialList).toHaveClass('min-w-0', 'w-full', 'max-w-full')
    expect(materialSection).toHaveClass(
      'min-w-0',
      'w-full',
      'max-w-full',
      'overflow-hidden',
    )
    expect(resourcePanel).toHaveClass('[scrollbar-gutter:stable]')
    expect(screen.getByText('학습 확인 퀴즈')).toBeInTheDocument()
    expect(screen.getByText('객관식')).toBeInTheDocument()
    expect(screen.queryByText('48점')).not.toBeInTheDocument()
    expect(screen.queryByText('강의실 자료')).not.toBeInTheDocument()
    expect(screen.queryByText('1/5')).not.toBeInTheDocument()
    expect(screen.queryByText(/^자료 \d+개$/)).not.toBeInTheDocument()
    expect(screen.queryByText('등록된 자료가 없습니다.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /학습 확인 퀴즈/ }))
    expect(await screen.findByRole('button', { name: 'PDF로 돌아가기' })).toBeInTheDocument()
  })

  it('dismisses the widget when the no/WAIT branch is chosen', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '아니요' }))

    await waitFor(() =>
      expect(
        screen.queryByText('현재 페이지를 설명할까요?'),
      ).not.toBeInTheDocument(),
    )
  })

  it('asks before moving to the next page when a quiz is declined', async () => {
    renderSessionDetail()

    fireEvent.click(await screen.findByRole('button', { name: '네' }))
    await screen.findByText('퀴즈를 진행할까요?')
    fireEvent.click(screen.getByRole('button', { name: '아니요' }))

    expect(await screen.findByText('다음 페이지로 이동할까요?')).toBeInTheDocument()
    expect(screen.queryByText('퀴즈를 진행할까요?')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '네' }))
    expect(await screen.findByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeInTheDocument()
    expect(await screen.findByText('현재 페이지를 설명할까요?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '네' }))
    expect(await screen.findByText('퀴즈를 진행할까요?')).toBeInTheDocument()
  })

  it('routes an explicit typed explanation command through the learning event', async () => {
    renderSessionDetail()

    await screen.findByText('현재 페이지를 설명할까요?')
    const input = screen.getByLabelText('질문')
    fireEvent.change(input, { target: { value: '현재 페이지 설명해줘' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('이 페이지는 핵심 개념의 정의를 다룹니다.')).toBeInTheDocument()
    expect(screen.getByText('퀴즈를 진행할까요?')).toBeInTheDocument()
  })
})
