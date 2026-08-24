import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiFailure, installApiFixtureServer } from '../../test/apiFixtureServer'
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
  it('keeps the learner header free of role-specific count and term labels', () => {
    renderPage()

    expect(screen.queryByText(/참여 중 \d+개/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d{4}년 \d학기/)).not.toBeInTheDocument()
  })

  it('opens search with the keyboard shortcut', () => {
    renderPage()

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })

    expect(
      screen.getByRole('dialog', { name: '강의실 검색' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveFocus()
  })

  it('changes the classroom sort order', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '최근 학습순' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '이름순' }))

    expect(screen.getByRole('button', { name: '이름순' })).toBeInTheDocument()
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
