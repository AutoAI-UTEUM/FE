import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { TestAuthProvider } from '../../../test/TestAuthProvider'
import { LearnerNoteCreatePage, LearnerNotesPage } from './LearnerNotesPage'
import { LearnerReviewQuizzesPage } from './LearnerReviewQuizzesPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function renderPage(page: ReactNode) {
  return render(
    <MemoryRouter>
      <TestAuthProvider>{page}</TestAuthProvider>
    </MemoryRouter>,
  )
}

describe('learner collection pages', () => {
  it('keeps the notes page usable when older sessions have no notes endpoint', async () => {
    mockLearnerCollectionApi({ notesUnavailable: true })
    renderPage(<LearnerNotesPage />)

    expect(
      await screen.findByRole('heading', { name: '저장한 노트가 없습니다' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '새 노트' })).toHaveAttribute(
      'href',
      '/notes/new',
    )
  })

  it('opens manual note creation as a full page instead of a dialog', () => {
    renderPage(<LearnerNoteCreatePage />)

    expect(screen.getByRole('heading', { name: '새 노트 작성' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /목록으로/ })).toHaveAttribute('href', '/notes')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(
      JSON.parse(window.localStorage.getItem('edupilot:manual-notes:1') ?? '[]'),
    ).toEqual([
      expect.objectContaining({ content: '# 새 노트' }),
    ])
  })

  it('shows only the note title until its body is expanded', async () => {
    mockLearnerCollectionApi({
      noteContent: '# 공식\n\n피타고라스 정리는 $a^2 + b^2 = c^2$입니다.',
    })
    const { container } = renderPage(<LearnerNotesPage />)

    const toggle = await screen.findByRole('button', { name: '공식 노트 펼치기' })
    expect(screen.getByText('시험 대비 요약.pdf')).toBeInTheDocument()
    expect(screen.getByText(/1페이지/)).toBeInTheDocument()
    expect(screen.queryByText('AI 답변')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /자료로 이동/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '노트 수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '노트 삭제' })).toBeInTheDocument()
    expect(screen.queryByText(/피타고라스 정리는/)).not.toBeInTheDocument()
    expect(container.querySelector('.katex')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByText(/피타고라스 정리는/)).toBeInTheDocument()
    expect(container.querySelector('.katex')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '공식 노트 접기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('groups multiple notes saved from the same material', async () => {
    mockLearnerCollectionApi({
      noteContents: ['# 핵심 공식\n\n첫 번째 노트', '# 오답 정리\n\n두 번째 노트'],
    })
    renderPage(<LearnerNotesPage />)

    const group = await screen.findByLabelText('시험 대비 요약.pdf 노트 모음')
    expect(within(group).getByText('노트 2개')).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: '핵심 공식 노트 펼치기' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: '오답 정리 노트 펼치기' })).toBeInTheDocument()
    expect(screen.getAllByText('시험 대비 요약.pdf')).toHaveLength(1)
    expect(within(group).getAllByRole('link', { name: /자료로 이동/ })).toHaveLength(1)
  })

  it('collects quizzes from learning sessions', async () => {
    mockLearnerCollectionApi()
    renderPage(<LearnerReviewQuizzesPage />)

    expect(await screen.findByText('학습 확인 퀴즈')).toBeInTheDocument()
    expect(screen.getByText('복습 필요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /결과 보기/ })).toHaveAttribute(
      'href',
      '/quizzes/50',
    )
  })
})

function mockLearnerCollectionApi(
  options: { noteContent?: string; noteContents?: string[]; notesUnavailable?: boolean } = {},
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'http://localhost',
    )

    if (url.pathname === '/api/sessions') {
      return success({
        items: [
          {
            currentPage: 3,
            materialId: 10,
            materialTitle: '시험 대비 요약.pdf',
            sessionId: 100,
            status: 'ACTIVE',
            updatedAt: '2026-08-01T06:00:00Z',
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      })
    }

    if (url.pathname === '/api/sessions/100/notes') {
      if (options.notesUnavailable) return new Response(null, { status: 404 })
      const noteContents = options.noteContents ?? (options.noteContent ? [options.noteContent] : [])
      return success({
        items: noteContents.map((content, index) => ({
          content,
          noteId: index + 1,
          pageNumber: index + 1,
          sourceMessageId: 501 + index,
        })),
        page: 0,
        size: 100,
        totalElements: noteContents.length,
        totalPages: noteContents.length > 0 ? 1 : 0,
      })
    }

    if (url.pathname === '/api/sessions/100/quizzes') {
      return success({
        items: [
          {
            createdAt: '2026-08-01T07:00:00Z',
            maxScore: 5,
            passed: false,
            quizId: 50,
            quizType: 'MULTIPLE_CHOICE',
            score: 2,
            submitted: true,
            title: '학습 확인 퀴즈',
          },
        ],
      })
    }

    return new Response(null, { status: 404 })
  })
}

function success(data: unknown): Response {
  return new Response(
    JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    },
  )
}
