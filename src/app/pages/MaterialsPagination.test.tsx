import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MaterialStatus } from '../../features/materials'
import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiFailure, apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { MaterialsPage } from './MaterialsPage'

interface MaterialDto {
  createdAt: string
  materialId: number
  processingStatus: MaterialStatus
  title: string
}

function createServer(count = 45) {
  const server = {
    items: Array.from({ length: count }, (_, index): MaterialDto => ({
      createdAt: '2026-10-01T00:00:00Z',
      materialId: index + 1,
      processingStatus: 'READY',
      title: `자료 ${index + 1}.pdf`,
    })),
    listRequests: [] as { page: number; request: Request }[],
    listOverride: undefined as ((page: number, snapshot: Response) => Response | Promise<Response>) | undefined,
    deleteCalls: 0,
    deleteResponse: undefined as Promise<void> | undefined,
    uploadResponse: undefined as Promise<void> | undefined,
    uploadCommit: undefined as Promise<void> | undefined,
  }
  installApiFixtureServer(async (request) => {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/materials') {
      const page = Number(url.searchParams.get('page'))
      expect(url.searchParams.get('size')).toBe('20')
      server.listRequests.push({ page, request })
      const snapshot = apiSuccess({
        items: server.items.slice(page * 20, (page + 1) * 20),
        page, size: 20, totalElements: server.items.length, totalPages: Math.ceil(server.items.length / 20),
      })
      return server.listOverride?.(page, snapshot) ?? snapshot
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/materials/')) {
      server.deleteCalls += 1
      const id = Number(url.pathname.split('/').at(-1))
      server.items = server.items.filter((item) => item.materialId !== id)
      await server.deleteResponse
      return apiSuccess(null)
    }
    if (request.method === 'PATCH' && url.pathname.startsWith('/api/materials/')) {
      const id = Number(url.pathname.split('/').at(-1))
      const body = await request.json() as { title: string }
      server.items = server.items.map((item) => item.materialId === id ? { ...item, title: body.title } : item)
      return apiSuccess(server.items.find((item) => item.materialId === id))
    }
    if (request.method === 'POST' && url.pathname === '/api/materials') {
      const material: MaterialDto = {
        createdAt: '2026-10-02T00:00:00Z', materialId: 99, processingStatus: 'PROCESSING', title: '새 자료.pdf',
      }
      await server.uploadCommit
      server.items.unshift(material)
      await server.uploadResponse
      return apiSuccess(material)
    }
    return undefined
  })
  return server
}

function renderPage(strict = false) {
  const content = <TestAuthProvider><MemoryRouter><MaterialsPage /></MemoryRouter></TestAuthProvider>
  return render(strict ? <StrictMode>{content}</StrictMode> : content)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function showNextPage() {
  fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
  await screen.findByRole('heading', { name: '자료 21.pdf' })
}

function uploadFile() {
  fireEvent.change(screen.getByLabelText('PDF 파일'), {
    target: { files: [new File(['pdf'], '새 자료.pdf', { type: 'application/pdf' })] },
  })
  fireEvent.click(screen.getByRole('button', { name: '업로드' }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('MaterialsPage pagination', () => {
  it('reaches every record beyond 20 with bounded next/previous requests and accurate totals', async () => {
    const server = createServer()
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByText('전체 45')).toBeInTheDocument()
    expect(screen.getByText('1-20 / 45개')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
    expect(server.listRequests.map(({ page }) => page)).toEqual([0])

    await showNextPage()
    expect(screen.queryByRole('heading', { name: '자료 1.pdf' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByText('21-40 / 45개')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByRole('heading', { name: '자료 45.pdf' })
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }))
    await screen.findByRole('heading', { name: '자료 21.pdf' })
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 2, 1])
  })

  it.each([1, 20, 21, 100])('visits all %i records once across page-size boundaries', async (count) => {
    const server = createServer(count)
    const visited: string[] = []
    renderPage()
    const pageCount = Math.ceil(count / 20)
    for (let page = 0; page < pageCount; page += 1) {
      await screen.findByRole('heading', { name: `자료 ${page * 20 + 1}.pdf` })
      expect(screen.getByText(`전체 ${count}`)).toBeInTheDocument()
      const rows = screen.getAllByRole('article')
      expect(rows).toHaveLength(Math.min(20, count - page * 20))
      visited.push(...rows.map((row) => within(row).getByRole('heading').textContent ?? ''))
      const next = screen.getByRole('button', { name: '다음 페이지' })
      if (page < pageCount - 1) fireEvent.click(next)
      else expect(next).toBeDisabled()
    }
    expect(visited).toEqual(Array.from({ length: count }, (_, index) => `자료 ${index + 1}.pdf`))
    expect(server.listRequests.map(({ page }) => page)).toEqual(Array.from({ length: pageCount }, (_, page) => page))
  })

  it('retains the visible page after a next-page failure and retries that page once despite repeated clicks', async () => {
    const server = createServer()
    const next = deferred<Response>()
    server.listOverride = (page, snapshot) => page === 1 ? next.promise : snapshot
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    const nextButton = screen.getByRole('button', { name: '다음 페이지' })
    fireEvent.click(nextButton)
    fireEvent.click(nextButton)
    expect(nextButton).toBeDisabled()
    expect(screen.getByRole('button', { name: '처리 상태 새로고침' })).toBeDisabled()
    expect(screen.getByRole('region', { name: '업로드된 자료' })).toHaveAttribute('aria-busy', 'true')
    await act(async () => next.resolve(apiFailure('UNAVAILABLE', '다음 자료 요청 실패', 503)))
    expect(await screen.findByRole('alert')).toHaveTextContent('다음 자료 요청 실패')
    expect(screen.getByRole('heading', { name: '자료 1.pdf' })).toBeInTheDocument()
    expect(screen.getByText('1 / 3 페이지')).toBeInTheDocument()
    server.listOverride = undefined
    const retry = screen.getByRole('button', { name: '다시 시도' })
    fireEvent.click(retry)
    fireEvent.click(retry)
    await screen.findByRole('heading', { name: '자료 21.pdf' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1])
  })

  it('supports an initial failure retry and an empty successful result', async () => {
    const server = createServer(0)
    server.listOverride = () => apiFailure('UNAVAILABLE', '자료 요청 실패', 503)
    renderPage()
    await screen.findByText('자료를 불러오지 못했습니다.')
    expect(screen.queryByText('등록된 자료가 없습니다.')).not.toBeInTheDocument()
    server.listOverride = undefined
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByText('등록된 자료가 없습니다.')
    expect(screen.getByText('0-0 / 0개')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
  })

  it('polls only the visible later page, suppresses overlapping polls, and stops once ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = createServer()
    server.items[20].processingStatus = 'PROCESSING'
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(server.listRequests).toHaveLength(1)
    await showNextPage()
    const poll = deferred<Response>()
    server.listOverride = () => poll.promise
    await vi.advanceTimersByTimeAsync(15_000)
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1])
    server.items[20].processingStatus = 'READY'
    await act(async () => poll.resolve(apiSuccess({
      items: server.items.slice(20, 40), page: 1, size: 20, totalElements: 45, totalPages: 3,
    })))
    expect(screen.queryByText('처리 중')).not.toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(server.listRequests).toHaveLength(3)
    expect(screen.getByRole('heading', { name: '자료 21.pdf' })).toBeInTheDocument()
  })

  it('ignores an aborted poll after navigating to a newer page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = createServer()
    server.items[0].processingStatus = 'PROCESSING'
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    const poll = deferred<Response>()
    let stale!: Response
    server.listOverride = (page, snapshot) => {
      if (page === 0) { stale = snapshot; return poll.promise }
      return snapshot
    }
    await vi.advanceTimersByTimeAsync(5000)
    await showNextPage()
    expect(server.listRequests[1].request.signal.aborted).toBe(true)
    await act(async () => poll.resolve(stale))
    expect(screen.getByRole('heading', { name: '자료 21.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '자료 1.pdf' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('backfills a deleted first-page row without skipping records and rejects a stale response', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const server = createServer(21)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    const refresh = deferred<Response>()
    let stale!: Response
    server.listOverride = (_, snapshot) => { stale = snapshot; return refresh.promise }
    fireEvent.click(screen.getByRole('button', { name: '처리 상태 새로고침' }))
    server.listOverride = undefined
    const deleteButton = screen.getByRole('button', { name: '자료 1.pdf 삭제' })
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)
    await screen.findByRole('heading', { name: '자료 21.pdf' })
    expect(server.deleteCalls).toBe(1)
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByText('전체 20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    expect(server.listRequests[1].request.signal.aborted).toBe(true)
    await act(async () => refresh.resolve(stale))
    expect(screen.queryByRole('heading', { name: '자료 1.pdf' })).not.toBeInTheDocument()
    expect(screen.getByText('전체 20')).toBeInTheDocument()
  })

  it('returns to the preceding page after deleting the only last-page row', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const server = createServer(21)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    fireEvent.click(screen.getByRole('button', { name: '자료 21.pdf 삭제' }))
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    expect(screen.getByText('1 / 1 페이지')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1, 0])
  })

  it('keeps a successful last-page deletion consistent when its reload fails and retries the preceding page', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const server = createServer(21)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    server.listOverride = () => apiFailure('UNAVAILABLE', '목록 새로고침 실패', 503)
    fireEvent.click(screen.getByRole('button', { name: '자료 21.pdf 삭제' }))
    await screen.findByText('자료를 불러오지 못했습니다.')
    expect(screen.queryByRole('heading', { name: '자료 21.pdf' })).not.toBeInTheDocument()
    expect(screen.getByText('페이지 확인 필요')).toBeInTheDocument()
    expect(screen.getByText('전체 확인 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    server.listOverride = undefined
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1, 1, 0])
    expect(server.deleteCalls).toBe(1)
  })

  it('retains processing rows after a failed background poll and tries again without a page error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = createServer(21)
    server.items[20].processingStatus = 'PROCESSING'
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    server.listOverride = () => apiFailure('UNAVAILABLE', '일시적인 오류', 503)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('heading', { name: '자료 21.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    server.listOverride = undefined
    server.items[20].processingStatus = 'READY'
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.queryByText('처리 중')).not.toBeInTheDocument()
    expect(screen.getByText('2 / 2 페이지')).toBeInTheDocument()
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1, 1])
  })

  it('does not decrement twice when a read observes deletion before the DELETE response', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const server = createServer(22)
    const deletion = deferred<void>()
    server.deleteResponse = deletion.promise
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    fireEvent.click(screen.getByRole('button', { name: '자료 22.pdf 삭제' }))
    await waitFor(() => expect(server.items).toHaveLength(21))
    fireEvent.click(screen.getByRole('button', { name: '처리 상태 새로고침' }))
    await screen.findByText('전체 21')
    server.listOverride = () => apiFailure('UNAVAILABLE', '목록 새로고침 실패', 503)
    await act(async () => deletion.resolve())
    await screen.findByText('목록 새로고침 실패')
    expect(screen.getByText('전체 확인 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: '자료 21.pdf' })).toBeInTheDocument()
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1, 1])
  })

  it('does not count an upload twice when a later-page read sees it before the POST response', async () => {
    const server = createServer(21)
    const upload = deferred<void>()
    server.uploadResponse = upload.promise
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    uploadFile()
    await waitFor(() => expect(server.items).toHaveLength(22))
    fireEvent.click(screen.getByRole('button', { name: '처리 상태 새로고침' }))
    await screen.findByText('전체 22')
    server.listOverride = () => apiFailure('UNAVAILABLE', '목록 새로고침 실패', 503)
    await act(async () => upload.resolve())
    await screen.findByText('목록 새로고침 실패')
    expect(screen.getByText('전체 확인 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: '새 자료.pdf' })).toBeInTheDocument()
    server.listOverride = undefined
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByText('전체 22')).toBeInTheDocument()
  })

  it('does not claim exact totals when a newer read precedes upload acceptance and reconciliation fails', async () => {
    const server = createServer(20)
    const commit = deferred<void>()
    server.uploadCommit = commit.promise
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    uploadFile()
    fireEvent.click(screen.getByRole('button', { name: '처리 상태 새로고침' }))
    await waitFor(() => expect(server.listRequests).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('region', { name: '업로드된 자료' })).toHaveAttribute('aria-busy', 'false'))
    expect(screen.getByText('전체 20')).toBeInTheDocument()
    server.listOverride = () => apiFailure('UNAVAILABLE', '목록 새로고침 실패', 503)
    await act(async () => commit.resolve())
    await screen.findByText('목록 새로고침 실패')
    expect(screen.getByText('전체 확인 필요')).toBeInTheDocument()
    expect(screen.queryByText('전체 20')).not.toBeInTheDocument()
    expect(screen.queryByText('1 / 1 페이지')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '새 자료.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '자료 1.pdf' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    server.listOverride = undefined
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByText('전체 21')
    expect(screen.getByText('1 / 2 페이지')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByRole('heading', { name: '자료 20.pdf' })
  })

  it('clears stale counts and same-page reload errors when a later background poll succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = createServer(20)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    server.listOverride = () => apiFailure('UNAVAILABLE', '목록 새로고침 실패', 503)
    uploadFile()
    await screen.findByText('목록 새로고침 실패')
    expect(screen.getByText('전체 확인 필요')).toBeInTheDocument()
    server.listOverride = undefined
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText('전체 21')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 페이지')).toBeInTheDocument()
    expect(screen.queryByText('목록 새로고침 실패')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled()
  })

  it('keeps an unrelated next-page error and its retry when the visible-page poll succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = createServer(21)
    server.items[0].processingStatus = 'PROCESSING'
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    server.listOverride = (page, snapshot) => page === 1 ? apiFailure('UNAVAILABLE', '다음 자료 요청 실패', 503) : snapshot
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByText('다음 자료 요청 실패')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText('다음 자료 요청 실패')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 페이지')).toBeInTheDocument()
    server.listOverride = undefined
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { name: '자료 21.pdf' })
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 0, 1])
  })

  it('clamps a current page removed outside this screen during a refresh', async () => {
    const server = createServer(21)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    server.items.pop()
    fireEvent.click(screen.getByRole('button', { name: '처리 상태 새로고침' }))
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    expect(screen.getByText('1 / 1 페이지')).toBeInTheDocument()
    expect(server.listRequests.map(({ page }) => page)).toEqual([0, 1, 1, 0])
  })

  it('preserves a renamed later-page title against an older pending refresh', async () => {
    const server = createServer(21)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await showNextPage()
    const refresh = deferred<Response>()
    let stale!: Response
    server.listOverride = (_, snapshot) => { stale = snapshot; return refresh.promise }
    fireEvent.click(screen.getByRole('button', { name: '처리 상태 새로고침' }))
    server.listOverride = undefined
    fireEvent.click(screen.getByRole('button', { name: '자료 21.pdf 이름 변경' }))
    const dialog = screen.getByRole('dialog', { name: '자료 이름 변경' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '자료 제목' }), { target: { value: '바뀐 제목.pdf' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '변경사항 저장' }))
    await screen.findByRole('heading', { name: '바뀐 제목.pdf' })
    await act(async () => refresh.resolve(stale))
    expect(screen.getByRole('heading', { name: '바뀐 제목.pdf' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '자료 21.pdf' })).not.toBeInTheDocument()
    expect(screen.getByText('2 / 2 페이지')).toBeInTheDocument()
  })

  it('returns to the first page after upload and ignores a stale next-page reply', async () => {
    const server = createServer(21)
    renderPage()
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    const next = deferred<Response>()
    let stale!: Response
    server.listOverride = (page, snapshot) => {
      if (page === 1) { stale = snapshot; return next.promise }
      return snapshot
    }
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    uploadFile()
    await screen.findByRole('heading', { name: '새 자료.pdf' })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
    expect(server.listRequests[1].request.signal.aborted).toBe(true)
    await act(async () => next.resolve(stale))
    expect(screen.getByRole('heading', { name: '새 자료.pdf' })).toBeInTheDocument()
    expect(screen.getByText('전체 22')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 페이지')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '자료 21.pdf' })).not.toBeInTheDocument()
    server.listOverride = undefined
    await showNextPage()
    expect(screen.getByRole('heading', { name: '자료 20.pdf' })).toBeInTheDocument()
  })

  it('does not lose existing materials when an upload finishes before the initial list', async () => {
    const server = createServer(21)
    const initial = deferred<Response>()
    let stale!: Response
    server.listOverride = (_, snapshot) => { stale = snapshot; return initial.promise }
    renderPage()
    await waitFor(() => expect(server.listRequests).toHaveLength(1))
    server.listOverride = undefined
    uploadFile()
    await screen.findByRole('heading', { name: '새 자료.pdf' })
    await screen.findByRole('heading', { name: '자료 1.pdf' })
    await act(async () => initial.resolve(stale))
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(screen.getByText('전체 22')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '새 자료.pdf' })).toBeInTheDocument()
  })

  it('aborts reads and ignores late responses after unmount, including Strict Mode cleanup', async () => {
    const server = createServer()
    const pending = deferred<Response>()
    let latest!: Response
    server.listOverride = (_, snapshot) => { latest = snapshot; return pending.promise }
    const { unmount } = renderPage(true)
    await waitFor(() => expect(server.listRequests).toHaveLength(1))
    expect(server.listRequests[0].request.signal.aborted).toBe(false)
    unmount()
    expect(server.listRequests[0].request.signal.aborted).toBe(true)
    await act(async () => pending.resolve(latest))
    expect(screen.queryByRole('heading', { name: '자료 1.pdf' })).not.toBeInTheDocument()
  })
})
