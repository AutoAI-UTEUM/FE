import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { SettingsPage } from './SettingsPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderSettings() {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<p>로그인 화면</p>} />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('SettingsPage', () => {
  it('shows the profile without a logout action', () => {
    renderSettings()

    expect(screen.getByDisplayValue('learner')).toBeInTheDocument()
    expect(screen.getByDisplayValue('learner@example.com')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /로그아웃/ }),
    ).not.toBeInTheDocument()

    const settingsMenu = screen.getByRole('navigation', { name: '설정 메뉴' })
    const menuButtons = Array.from(settingsMenu.querySelectorAll('button'))
    expect(menuButtons.at(-1)).toHaveTextContent('회원 탈퇴')
    expect(menuButtons.at(-1)).toHaveClass('text-rose-700')
    expect(menuButtons.at(-1)).not.toHaveClass('border-t')
    expect(screen.queryByText('변경사항은 계정에 저장됩니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('이메일은 변경할 수 없습니다.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '새 자료 알림' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '학습 리마인더' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('AI 답변 스타일')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '화면 모드' }))
    expect(
      screen.queryByText('작업 환경에 맞게 화면 밝기를 조정합니다.'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '알림' }))
    expect(screen.getByRole('switch', { name: '새 자료 알림' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '학습 리마인더' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI 학습 도우미' }))
    expect(screen.getByLabelText('AI 답변 스타일')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '피드백' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '업데이트' })).not.toBeInTheDocument()
  })

  it('saves notification and AI preferences immediately', async () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '알림' }))

    const materialNotification = screen.getByRole('switch', { name: '새 자료 알림' })
    await waitFor(() => expect(materialNotification).toBeEnabled())
    fireEvent.click(materialNotification)

    await waitFor(() => {
      expect(getPreferenceUpdates()).toContainEqual({
        aiAnswerStyle: 'NORMAL',
        newMaterialNotification: false,
        studyReminder: false,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'AI 학습 도우미' }))
    const answerStyle = screen.getByLabelText('AI 답변 스타일')
    await waitFor(() => expect(answerStyle).toBeEnabled())
    fireEvent.change(answerStyle, { target: { value: 'DETAILED' } })

    await waitFor(() => {
      expect(getPreferenceUpdates()).toContainEqual({
        aiAnswerStyle: 'DETAILED',
        newMaterialNotification: false,
        studyReminder: false,
      })
    })
  })

  it('changes a local password and requires login again', async () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'newPassword456' } })
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'newPassword456' } })
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경 실행' }))

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
    const passwordCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) => String(input instanceof Request ? input.url : input).endsWith('/api/users/me/password'))
    expect(passwordCall?.[1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(String(passwordCall?.[1]?.body))).toEqual({ currentPassword: 'password123', newPassword: 'newPassword456' })
  })

  it('withdraws the account after password confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '회원 탈퇴' }))

    fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
      target: { value: 'password-123' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '회원 탈퇴 실행' }),
    )

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
    expect(window.confirm).toHaveBeenCalled()
  })

  it('shows a field error for a wrong password', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '회원 탈퇴' }))

    fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
      target: { value: 'wrong-password-1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '회원 탈퇴 실행' }),
    )

    expect(
      await screen.findByText('비밀번호가 올바르지 않습니다.'),
    ).toBeInTheDocument()
  })
})

function getPreferenceUpdates(): unknown[] {
  return vi.mocked(globalThis.fetch).mock.calls.flatMap(([input, init]) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.endsWith('/api/users/me/preferences') || init?.method !== 'PATCH' || typeof init.body !== 'string') return []
    return [JSON.parse(init.body)]
  })
}
