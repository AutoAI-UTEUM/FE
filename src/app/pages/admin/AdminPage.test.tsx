import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResponsiveViewportProvider } from '../../../shared/responsive'
import { TestAuthProvider } from '../../../test/TestAuthProvider'
import { AdminPage } from './AdminPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AdminPage', () => {
  it('refreshes the selected AI usage range from an icon-only button', async () => {
    const requestedPaths: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      requestedPaths.push(url.pathname)
      if (url.pathname === '/api/admin/users') {
        return success({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/admin/ai-usage/summary') {
        return success({ daily: [], features: [] })
      }
      if (url.pathname === '/api/admin/ai-usage/users') {
        return success({ items: [] })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <ResponsiveViewportProvider>
        <TestAuthProvider>
          <MemoryRouter><AdminPage /></MemoryRouter>
        </TestAuthProvider>
      </ResponsiveViewportProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'AI 사용량' }))
    await waitFor(() => expect(countRequests(requestedPaths, '/api/admin/ai-usage/summary')).toBe(1))

    const refreshButton = screen.getByRole('button', { name: 'AI 사용량 새로고침' })
    expect(refreshButton).toHaveAttribute('title', '새로고침')
    expect(refreshButton).toHaveTextContent('')
    fireEvent.click(refreshButton)

    await waitFor(() => expect(countRequests(requestedPaths, '/api/admin/ai-usage/summary')).toBe(2))
    expect(countRequests(requestedPaths, '/api/admin/ai-usage/users')).toBe(2)
  })
})

function countRequests(paths: string[], path: string) {
  return paths.filter((requestedPath) => requestedPath === path).length
}

function success(data: unknown) {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
