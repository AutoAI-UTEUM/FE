import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { DiagnosisPage } from './DiagnosisPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderDiagnosisPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={['/sessions/100/diagnosis/42']}>
        <Routes>
          <Route
            path="/sessions/:sessionId/diagnosis/:diagnosisId"
            element={<DiagnosisPage />}
          />
          <Route path="/sessions/:sessionId" element={<p>학습 세션 화면</p>} />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('DiagnosisPage', () => {
  it('restores pending diagnosis from the session API', async () => {
    renderDiagnosisPage()

    expect(
      await screen.findByRole('heading', { name: '진단 복원' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/저득점 결과 48점/)).toBeInTheDocument()
    expect(screen.getByText('현재 페이지 핵심 개념')).toBeInTheDocument()
  })

  it('validates diagnosis answer before submission', async () => {
    renderDiagnosisPage()
    await screen.findByRole('heading', { name: '진단 복원' })

    fireEvent.click(screen.getByRole('button', { name: '진단 제출' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '진단 답변을 입력하세요.',
    )
  })

  it('renders the correction returned by a learning turn', async () => {
    renderDiagnosisPage()

    fireEvent.change(
      await screen.findByLabelText(
        '오답을 고른 이유와 헷갈린 개념을 적어 보세요.',
      ),
      {
        target: {
          value: '개념 정의와 예시를 헷갈려서 오답을 골랐습니다.',
        },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: '진단 제출' }))

    expect(
      await screen.findByRole('heading', { name: '교정 메시지' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('개념 정의와 적용 사례를 분리해서 정리해 보세요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '일반 질문으로 이어가기' }),
    ).toHaveAttribute('href', '/sessions/100')
    expect(screen.getByRole('button', { name: '객관식' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OX' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'OX' }))
    expect(await screen.findByText('학습 세션 화면')).toBeInTheDocument()
  })
})
