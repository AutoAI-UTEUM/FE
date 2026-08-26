import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('edits a custom criterion through the PATCH API', async () => {
    let patchBody: Record<string, unknown> | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria') {
        return success({ items: [criterionFixture] })
      }
      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria/generation') {
        return success({ message: '', registeredCount: 0, status: 'IDLE' })
      }
      if (method === 'PATCH' && url.pathname === '/api/classrooms/12/report-criteria/21') {
        patchBody = input instanceof Request
          ? await input.clone().json() as Record<string, unknown>
          : JSON.parse(String(init?.body)) as Record<string, unknown>
        return success({
          ...criterionFixture,
          criterionId: 22,
          description: '수정된 설명',
          name: '수정된 기준',
          rubric: { summary: '수정된 평가 내용' },
          version: 'v2',
        })
      }
      return new Response(null, { status: 404 })
    })

    renderPage()
    expect(await screen.findByText('자동 생성 기준')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '리포트 평가 기준 관리' })).toBeInTheDocument()
    expect(screen.getByText('리포트에 사용할 평가 기준을 추가하거나 수정하고 활성 상태를 관리하세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    const editForm = screen.getByRole('form', { name: '자동 생성 기준 수정' })
    fireEvent.change(within(editForm).getByRole('textbox', { name: '이름' }), { target: { value: '수정된 기준' } })
    fireEvent.change(within(editForm).getByRole('textbox', { name: '설명' }), { target: { value: '수정된 설명' } })
    fireEvent.change(within(editForm).getByRole('textbox', { name: '평가 기준' }), { target: { value: '수정된 평가 내용' } })
    fireEvent.click(within(editForm).getByRole('button', { name: '변경사항 저장' }))

    expect(await screen.findByText('수정된 기준')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '자동 생성 기준 수정' })).not.toBeInTheDocument()
    expect(patchBody).toMatchObject({
      description: '수정된 설명',
      name: '수정된 기준',
      rubric: { summary: '수정된 평가 내용' },
    })
  })

  it('deletes only a custom criterion with an id', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    let deleteRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria') {
        return success({ items: [builtinCriterionFixture, criterionFixture] })
      }
      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria/generation') {
        return success({ message: '', registeredCount: 0, status: 'IDLE' })
      }
      if (method === 'DELETE' && url.pathname === '/api/classrooms/12/report-criteria/21') {
        deleteRequests += 1
        return success(null)
      }
      return new Response(null, { status: 404 })
    })

    renderPage()
    expect(await screen.findByText('자동 생성 기준')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '학습 참여 삭제' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '자동 생성 기준 삭제' }))

    expect(window.confirm).toHaveBeenCalledWith(
      "'자동 생성 기준' 평가 기준을 삭제할까요? 삭제한 기준은 복구할 수 없습니다.",
    )
    expect(await screen.findByText('평가 기준을 삭제했습니다.')).toBeInTheDocument()
    expect(screen.queryByText('자동 생성 기준')).not.toBeInTheDocument()
    expect(screen.getByText('학습 참여')).toBeInTheDocument()
    expect(deleteRequests).toBe(1)
  })

  it.each([
    [403, 'FORBIDDEN', '평가 기준을 삭제할 권한이 없습니다.'],
    [404, 'RESOURCE_NOT_FOUND', '이미 삭제되었거나 찾을 수 없는 평가 기준입니다.'],
  ] as const)('keeps the criterion and shows guidance when deletion returns %i', async (status, code, expected) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET')

      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria') {
        return success({ items: [criterionFixture] })
      }
      if (method === 'GET' && url.pathname === '/api/classrooms/12/report-criteria/generation') {
        return success({ message: '', registeredCount: 0, status: 'IDLE' })
      }
      if (method === 'DELETE' && url.pathname === '/api/classrooms/12/report-criteria/21') {
        return failure(code, '평가 기준을 삭제하지 못했습니다.', status)
      }
      return new Response(null, { status: 404 })
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '자동 생성 기준 삭제' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    expect(screen.getByText('자동 생성 기준')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '자동 생성 기준 삭제' })).toBeEnabled()
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

const builtinCriterionFixture = {
  active: true,
  allowedSources: ['SESSION'],
  builtin: true,
  criterionId: null,
  criterionKey: 'engagement',
  description: '기본 학습 참여 기준',
  minEvidence: 2,
  name: '학습 참여',
  rubric: { summary: '학습 활동 참여도를 평가합니다.' },
  version: 'v1',
  weight: 1,
}
