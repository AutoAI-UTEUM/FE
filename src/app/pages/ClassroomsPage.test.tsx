import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { ClassroomsPage } from './ClassroomsPage'

afterEach(cleanup)

function renderPage() {
  return render(
    <TestAuthProvider>
      <ClassroomsPage />
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
})
