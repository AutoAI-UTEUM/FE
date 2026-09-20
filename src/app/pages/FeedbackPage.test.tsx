import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { FeedbackPage } from './FeedbackPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('FeedbackPage', () => {
  it('submits feedback from its own page', async () => {
    render(
      <TestAuthProvider>
        <MemoryRouter>
          <FeedbackPage />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    fireEvent.change(screen.getByLabelText('분류'), { target: { value: 'BUG' } })
    fireEvent.change(screen.getByLabelText('내용'), {
      target: { value: '피드백 화면에서 문제가 발생합니다.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('내용')).toHaveValue('')
    const feedbackCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) =>
      String(input instanceof Request ? input.url : input).endsWith('/api/feedback'))
    expect(feedbackCall?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(feedbackCall?.[1]?.body))).toMatchObject({
      category: 'BUG',
      clientVersion: '0.1.0',
      message: '피드백 화면에서 문제가 발생합니다.',
      pageUrl: expect.any(String),
    })
  })
})
