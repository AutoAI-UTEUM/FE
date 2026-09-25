import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiFailure, apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { ClassroomsPage } from './ClassroomsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter>
        <ClassroomsPage />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('ClassroomsPage', () => {
  it('uses four-column compact summary cards for learners', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess({
          items: [{
            averageProgressRate: 38,
            classroomId: 12,
            color: 'BLUE',
            currentWeek: 6,
            endDate: '2026-11-15',
            instructorName: '진동섭',
            learnerCount: 42,
            name: 'SK-Mini-CDS과정',
            pendingRequestCount: 0,
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 15,
          }],
          page: 0,
          size: 100,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return undefined
    })
    renderPage()

    const classroomList = await screen.findByRole('region', { name: '참여 중인 강의실' })
    const classroomLink = within(classroomList).getByRole('link', { name: 'SK-Mini-CDS과정 강의실 열기' })

    expect(classroomLink.parentElement).toHaveClass('xl:grid-cols-4')
    expect(classroomLink).toHaveClass('min-h-[180px]')
    expect(classroomLink).toHaveTextContent('2026 1학기 · 6주차 · 진동섭')
    expect(classroomLink).toHaveTextContent('진도38%')
    expect(within(classroomLink).queryByText('수강 중')).not.toBeInTheDocument()
    expect(within(classroomLink).queryByText(/학습 이어가기/)).not.toBeInTheDocument()
  })

  it('keeps the learner header free of role-specific count and term labels', () => {
    renderPage()

    expect(screen.queryByText(/참여 중 \d+개/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d{4}년 \d학기/)).not.toBeInTheDocument()
    expect(screen.queryByText(/이어서 학습하기/)).not.toBeInTheDocument()
    expect(screen.queryByText(/쪽부터 계속/)).not.toBeInTheDocument()
  })

  it('opens search with the keyboard shortcut', () => {
    renderPage()

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })

    expect(
      screen.getByRole('dialog', { name: '강의실 검색' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveFocus()
  })

  it('closes learner dialogs only when their backdrop is pressed', () => {
    renderPage()

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })
    const searchDialog = screen.getByRole('dialog', { name: '강의실 검색' })
    fireEvent.mouseDown(within(searchDialog).getByRole('textbox', { name: '검색어' }))
    expect(searchDialog).toBeInTheDocument()
    fireEvent.mouseDown(searchDialog)
    expect(screen.queryByRole('dialog', { name: '강의실 검색' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '강의실 참여' }))
    const joinDialog = screen.getByRole('dialog', { name: '강의실 참여' })
    fireEvent.mouseDown(within(joinDialog).getByRole('textbox', { name: '초대 코드' }))
    expect(joinDialog).toBeInTheDocument()
    fireEvent.mouseDown(joinDialog)
    expect(screen.queryByRole('dialog', { name: '강의실 참여' })).not.toBeInTheDocument()
  })

  it('changes the classroom sort order', () => {
    renderPage()

    const sortSelect = screen.getByRole('combobox', { name: '강의실 정렬' })
    expect(sortSelect.closest('[data-page-toolbar="filters"]')).toBeInTheDocument()
    fireEvent.change(sortSelect, { target: { value: 'name' } })

    expect(sortSelect).toHaveValue('name')
  })

  it('requires an invite code before requesting classroom access', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '강의실 참여' }))

    const submitButton = screen.getByRole('button', { name: '참여 요청' })
    expect(submitButton).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: '초대 코드' }), {
      target: { value: 'EDU-2026' },
    })
    expect(submitButton).toBeEnabled()
  })

  it('explains a duplicate classroom join request', async () => {
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/api/classroom-join-requests') {
        return apiFailure('JOIN_REQUEST_ALREADY_EXISTS', '중복 신청입니다.', 409)
      }
      return undefined
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '강의실 참여' }))
    fireEvent.change(screen.getByRole('textbox', { name: '초대 코드' }), {
      target: { value: 'EDU-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: '참여 요청' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      '이미 참여를 신청한 강의실입니다. 승인 상태를 확인해 주세요.',
    ))
  })
})
