import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import { InstructorReportCriteriaPage } from './InstructorReportsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('InstructorReportCriteriaPage', () => {
  it('polls a generated criterion job and reloads the criteria after completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let criteriaRequests = 0
    let generationRequests = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria') {
        criteriaRequests += 1
        return success({
          items: criteriaRequests === 1 ? [] : [criterionFixture],
        })
      }
      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria/generation') {
        generationRequests += 1
        return success(generationRequests === 1
          ? { message: '', registeredCount: 0, status: 'IDLE' }
          : { message: '완료', registeredCount: 1, status: 'COMPLETED' })
      }
      if (method === 'POST' && url.pathname === '/api/classrooms/12/report-criteria/generate') {
        return success(null, 202)
      }
      return new Response(null, { status: 404 })
    })

    renderPage()
    const generateButton = await screen.findByRole('button', { name: '지표 생성' })
    fireEvent.click(generateButton)

    await waitFor(() => expect(screen.getByRole('button', { name: '생성 중' })).toBeDisabled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500)
    })

    expect(await screen.findByText('자동 생성 기준')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지표 생성' })).toBeEnabled()
    expect(criteriaRequests).toBe(2)
  })

  it.each([
    ['OVERVIEW_NOT_READY', '개요 생성 전', '자료 개요가 준비된 후 이용할 수 있어요.'],
    ['REPORT_CRITERIA_LIMIT_EXCEEDED', '커스텀 기준 최대 개수 초과', '기존 지표를 정리한 후 다시 시도해 주세요.'],
  ])('shows the expected guidance for a 400 generation error', async (code, message, expected) => {
    installGenerationError(code, message, 400)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '지표 생성' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    expect(screen.getByRole('button', { name: '지표 생성' })).toBeEnabled()
  })

  it('treats a 409 response as an already running generation', async () => {
    installGenerationError('REPORT_CRITERIA_GENERATION_RUNNING', '이미 생성 중입니다.', 409)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '지표 생성' }))

    expect(await screen.findByRole('button', { name: '생성 중' })).toBeDisabled()
  })

  it('shows the server message when the latest generation has failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms/12/report-criteria') {
        return success({ items: [] })
      }
      if (url.pathname === '/api/classrooms/12/report-criteria/generation') {
        return success({ message: '자료 내용을 분석하지 못했습니다.', registeredCount: 0, status: 'FAILED' })
      }
      return new Response(null, { status: 404 })
    })

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('자료 내용을 분석하지 못했습니다.')
    expect(screen.getByRole('button', { name: '지표 생성' })).toBeEnabled()
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/classrooms/12/report-criteria']}>
      <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
        <ToastProvider>
          <Routes>
            <Route path="/classrooms/:classroomId/report-criteria" element={<InstructorReportCriteriaPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function installGenerationError(code: string, message: string, status: number) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

    if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria') {
      return success({ items: [] })
    }
    if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria/generation') {
      return success({ message: '', registeredCount: 0, status: 'IDLE' })
    }
    if (method === 'POST' && url.pathname === '/api/classrooms/12/report-criteria/generate') {
      return failure(code, message, status)
    }
    return new Response(null, { status: 404 })
  })
}

function success(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data, message: 'ok', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function failure(code: string, message: string, status: number) {
  return new Response(JSON.stringify({
    error: { code, details: [], message },
    success: false,
    traceId: 'trace-report-criteria',
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

const criterionFixture = {
  active: true,
  allowedSources: ['SESSION'],
  builtin: false,
  criterionId: 21,
  criterionKey: 'generated-weekly-review',
  description: '강의 자료에 맞춘 평가 기준',
  minEvidence: 2,
  name: '자동 생성 기준',
  rubric: { summary: '주요 개념 이해도를 평가합니다.' },
  version: 'v1',
  weight: 1,
}
