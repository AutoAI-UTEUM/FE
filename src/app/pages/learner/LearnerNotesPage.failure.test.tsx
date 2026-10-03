import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider, useAuth, type AuthUser } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import { TestAuthProvider } from '../../../test/TestAuthProvider'
import {
  LearnerNoteCreatePage,
  LearnerNoteEditPage,
  LearnerNotesPage,
} from './LearnerNotesPage'

vi.mock('../../../shared/ui/NotionBlockEditor', () => ({
  default: ({
    ariaLabel,
    initialValue,
    onChange,
  }: {
    ariaLabel: string
    initialValue: string
    onChange: (markdown: string, document: string) => void
  }) => (
    <textarea
      aria-label={ariaLabel}
      defaultValue={initialValue}
      onChange={(event) => onChange(event.target.value, 'synthetic-document')}
    />
  ),
}))

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  vi.stubEnv('VITE_API_CAPABILITIES', 'reports,policy-consent')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('LearnerNotesPage session-note failures', () => {
  it.each([
    ['500', () => apiError(500, '세션 노트 서버 오류')],
    ['429', () => apiError(429, '요청이 너무 많습니다')],
    ['network', () => Promise.reject(new Error('network unavailable'))],
  ])('does not present an all-%s failure as an empty success', async (_label, failure) => {
    mockNotesApi({
      sessions: [session(100), session(101)],
      sessionNotes: () => failure(),
    })

    renderNotesPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '세션 노트를 불러오지 못했습니다',
    )
    expect(
      screen.queryByRole('heading', { name: '저장한 노트가 없습니다' }),
    ).not.toBeInTheDocument()
  })

  it('keeps successful sessions visible and retries only failed sessions', async () => {
    let failedSessionCalls = 0
    mockNotesApi({
      sessions: [session(100, '성공 자료.pdf'), session(101, '실패 자료.pdf')],
      sessionNotes: (sessionId) => {
        if (sessionId === '100') return notesResponse(1, '# 보존되는 노트')
        failedSessionCalls += 1
        return failedSessionCalls === 1
          ? apiError(500, '일시적인 오류')
          : notesResponse(2, '# 재시도로 복구된 노트')
      },
    })

    renderNotesPage()

    expect(await screen.findByText('보존되는 노트')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '일부 세션의 노트를 불러오지 못했습니다. 실패한 세션: 1개.',
    )
    expect(screen.queryByText('재시도로 복구된 노트')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '실패한 세션 다시 시도' }))

    expect(await screen.findByText('재시도로 복구된 노트')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(countRequests('/api/sessions/100/notes')).toBe(1)
    expect(countRequests('/api/sessions/101/notes')).toBe(2)
  })

  it('aborts a failed-session retry when the list owner is disposed', async () => {
    let retrySignal: AbortSignal | undefined
    let calls = 0
    mockNotesApi({
      sessions: [session(100)],
      sessionNotes: (_sessionId, signal) => {
        calls += 1
        if (calls === 1) return apiError(500, '일시적인 오류')
        retrySignal = signal
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      },
    })
    const view = renderNotesPage()

    fireEvent.click(await screen.findByRole('button', { name: '실패한 세션 다시 시도' }))
    await waitFor(() => expect(retrySignal).toBeDefined())
    expect(retrySignal?.aborted).toBe(false)

    view.unmount()

    expect(retrySignal?.aborted).toBe(true)
  })
})

describe('LearnerNotesPage owner isolation', () => {
  it('re-enables failed-session retry for a replacement owner after aborting the old retry', async () => {
    let sessionNoteCalls = 0
    let ownerOneRetrySignal: AbortSignal | undefined
    mockNotesApi({
      sessions: [session(100)],
      sessionNotes: (_sessionId, signal) => {
        sessionNoteCalls += 1
        if (sessionNoteCalls === 2) {
          ownerOneRetrySignal = signal
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          })
        }
        return apiError(500, `owner failure ${sessionNoteCalls}`)
      },
    })
    renderOwnerSwitchingNotesPage()

    fireEvent.click(await screen.findByRole('button', { name: '실패한 세션 다시 시도' }))
    await waitFor(() => expect(ownerOneRetrySignal).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: '소유자 교체' }))

    expect(ownerOneRetrySignal?.aborted).toBe(true)
    expect(await screen.findByRole('button', { name: '실패한 세션 다시 시도' })).toBeEnabled()
    expect(sessionNoteCalls).toBe(3)
  })

  it('aborts the old server list and ignores its late result after owner replacement', async () => {
    vi.stubEnv(
      'VITE_API_CAPABILITIES',
      'reports,policy-consent,user-notes',
    )
    const lateOwnerOne = deferred<Response>()
    let ownerOneSignal: AbortSignal | undefined
    mockNotesApi({
      sessions: [],
      sessionNotes: () => notesResponse(1, '# unused'),
      userNotes: (signal, call) => {
        if (call === 1) {
          ownerOneSignal = signal
          return lateOwnerOne.promise
        }
        return userNotesResponse(2, '# owner two')
      },
    })
    renderOwnerSwitchingNotesPage()

    await waitFor(() => expect(ownerOneSignal).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: '소유자 교체' }))

    expect(await screen.findByText('owner two')).toBeInTheDocument()
    expect(ownerOneSignal?.aborted).toBe(true)

    lateOwnerOne.resolve(userNotesResponse(1, '# late owner one'))

    await waitFor(() => {
      expect(screen.getByText('owner two')).toBeInTheDocument()
      expect(screen.queryByText('late owner one')).not.toBeInTheDocument()
    })
  })

  it('keeps capability-off local notes isolated by owner', async () => {
    window.localStorage.setItem(
      'edupilot:manual-notes:1',
      JSON.stringify([manualNote('owner-one', '# owner one local')]),
    )
    window.localStorage.setItem(
      'edupilot:manual-notes:2',
      JSON.stringify([manualNote('owner-two', '# owner two local')]),
    )
    mockNotesApi({
      sessions: [],
      sessionNotes: () => notesResponse(1, '# unused'),
    })
    renderOwnerSwitchingNotesPage()

    expect(await screen.findByText('owner one local')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '소유자 교체' }))

    expect(screen.queryByText('owner one local')).not.toBeInTheDocument()
    expect(await screen.findByText('owner two local')).toBeInTheDocument()
    expect(screen.queryByText('owner one local')).not.toBeInTheDocument()
  })

  it('does not let owner A late delete remove owner B content or toast', async () => {
    const lateDelete = deferred<Response>()
    let sessionNoteCalls = 0
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockNotesApi({
      deleteNote: () => lateDelete.promise,
      sessions: [session(100)],
      sessionNotes: () => {
        sessionNoteCalls += 1
        return sessionNoteCalls === 1
          ? notesResponse(1, '# owner one session')
          : notesResponse(1, '# owner two session')
      },
    })
    renderOwnerSwitchingNotesPage()

    expect(await screen.findByText('owner one session')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '노트 삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '소유자 교체' }))

    expect(screen.queryByText('owner one session')).not.toBeInTheDocument()
    expect(await screen.findByText('owner two session')).toBeInTheDocument()

    await act(async () => {
      lateDelete.resolve(new Response(null, { status: 204 }))
    })

    expect(screen.getByText('owner two session')).toBeInTheDocument()
    expect(screen.queryByText('노트를 삭제했습니다.')).not.toBeInTheDocument()
  })
})

describe('LearnerNoteEditPage request isolation', () => {
  it('clears A and blocks saving when navigating to B whose load fails', async () => {
    mockNotesApi({
      sessions: [session(100, 'A 자료.pdf'), session(101, 'B 자료.pdf')],
      sessionNotes: (sessionId) => sessionId === '100'
        ? notesResponse(1, '# A의 비밀 내용')
        : apiError(403, 'B 노트를 볼 수 없습니다'),
    })
    renderEditorRoutes()

    expect(await screen.findByDisplayValue('# A의 비밀 내용')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'B 편집' }))

    expect(await screen.findByRole('heading', { name: '노트를 불러오지 못했습니다' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('# A의 비밀 내용')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    expect(countRequests('/api/notes/2', 'PATCH')).toBe(0)
  })

  it('ignores a late A load after B becomes the current editor', async () => {
    const lateA = deferred<Response>()
    mockNotesApi({
      sessions: [session(100, 'A 자료.pdf'), session(101, 'B 자료.pdf')],
      sessionNotes: (sessionId) => sessionId === '100'
        ? lateA.promise
        : notesResponse(2, '# B의 내용'),
    })
    renderEditorRoutes()

    fireEvent.click(screen.getByRole('link', { name: 'B 편집' }))
    expect(await screen.findByDisplayValue('# B의 내용')).toBeInTheDocument()

    lateA.resolve(notesResponse(1, '# 늦게 도착한 A'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('# B의 내용')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('# 늦게 도착한 A')).not.toBeInTheDocument()
    })
  })

  it('does not let a late A save navigate or toast after the editor moves to B', async () => {
    const lateSave = deferred<Response>()
    mockNotesApi({
      sessions: [session(100, 'A 자료.pdf'), session(101, 'B 자료.pdf')],
      sessionNotes: (sessionId) => sessionId === '100'
        ? notesResponse(1, '# A 내용')
        : notesResponse(2, '# B 내용'),
      updateNote: () => lateSave.promise,
    })
    renderEditorRoutes()

    expect(await screen.findByDisplayValue('# A 내용')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    fireEvent.click(screen.getByRole('link', { name: 'B 편집' }))
    expect(await screen.findByDisplayValue('# B 내용')).toBeInTheDocument()

    lateSave.resolve(noteResponse(1, '# A 내용'))

    await waitFor(() => expect(screen.getByDisplayValue('# B 내용')).toBeInTheDocument())
    expect(screen.queryByText('노트 목록')).not.toBeInTheDocument()
    expect(screen.queryByText('노트를 수정했습니다.')).not.toBeInTheDocument()
  })

  it('keeps an edited draft after a same-scope save failure', async () => {
    mockNotesApi({
      sessions: [session(100, 'A 자료.pdf')],
      sessionNotes: () => notesResponse(1, '# 원본'),
      updateNote: () => apiError(500, '저장 실패'),
    })
    renderEditorRoutes()

    const editor = await screen.findByLabelText('노트 내용 수정')
    fireEvent.change(editor, { target: { value: '# 저장되지 않은 초안' } })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))

    expect(await screen.findByText('저장 실패')).toBeInTheDocument()
    expect(screen.getByDisplayValue('# 저장되지 않은 초안')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeEnabled()
  })
})

describe('LearnerNotesPage mutation de-duplication', () => {
  it('submits a create only once for same-tick clicks', async () => {
    renderWithRouter(<LearnerNoteCreatePage />)
    const save = screen.getByRole('button', { name: '저장' })

    act(() => {
      save.click()
      save.click()
    })

    await waitFor(() => {
      const notes = JSON.parse(
        window.localStorage.getItem('edupilot:manual-notes:1') ?? '[]',
      ) as unknown[]
      expect(notes).toHaveLength(1)
    })
  })

  it('submits an edit only once for same-tick clicks', async () => {
    const update = deferred<Response>()
    mockNotesApi({
      sessions: [session(100)],
      sessionNotes: () => notesResponse(1, '# 원본'),
      updateNote: () => update.promise,
    })
    renderEditorRoutes()
    const save = await screen.findByRole('button', { name: '변경사항 저장' })

    act(() => {
      save.click()
      save.click()
    })

    expect(countRequests('/api/notes/1', 'PATCH')).toBe(1)
    update.resolve(noteResponse(1, '# 원본'))
  })

  it('submits a delete only once for same-tick clicks and sends none on cancel', async () => {
    const remove = deferred<Response>()
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValue(true)
    mockNotesApi({
      deleteNote: () => remove.promise,
      sessions: [session(100)],
      sessionNotes: () => notesResponse(1, '# 삭제 대상'),
    })
    renderNotesPage()
    const deleteButton = await screen.findByRole('button', { name: '노트 삭제' })

    fireEvent.click(deleteButton)
    expect(countRequests('/api/notes/1', 'DELETE')).toBe(0)

    act(() => {
      deleteButton.click()
      deleteButton.click()
    })

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(countRequests('/api/notes/1', 'DELETE')).toBe(1)
    remove.resolve(new Response(null, { status: 204 }))
  })
})

function renderNotesPage() {
  return renderWithRouter(<LearnerNotesPage />)
}

function renderWithRouter(page: ReactNode) {
  return render(
    <MemoryRouter>
      <TestAuthProvider>{page}</TestAuthProvider>
    </MemoryRouter>,
  )
}

function renderEditorRoutes() {
  return render(
    <MemoryRouter initialEntries={['/notes/session/1/edit?sessionId=100']}>
      <TestAuthProvider>
        <Link to="/notes/session/2/edit?sessionId=101">B 편집</Link>
        <Routes>
          <Route path="/notes" element={<p>노트 목록</p>} />
          <Route path="/notes/:noteKind/:noteId/edit" element={<LearnerNoteEditPage />} />
        </Routes>
      </TestAuthProvider>
    </MemoryRouter>,
  )
}

interface MockNotesApiOptions {
  deleteNote?: () => Promise<Response> | Response
  sessionNotes: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<Response> | Response
  sessions: ReturnType<typeof session>[]
  updateNote?: (noteId: string) => Promise<Response> | Response
  userNotes?: (
    signal: AbortSignal | undefined,
    call: number,
  ) => Promise<Response> | Response
}

function mockNotesApi(options: MockNotesApiOptions) {
  let userNotesCalls = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'http://localhost',
    )
    const method = input instanceof Request ? input.method : init?.method ?? 'GET'
    const signal = input instanceof Request ? input.signal : init?.signal ?? undefined

    if (url.pathname === '/api/sessions') {
      return success({
        items: options.sessions,
        page: 0,
        size: 20,
        totalElements: options.sessions.length,
        totalPages: options.sessions.length > 0 ? 1 : 0,
      })
    }

    const sessionNotesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/notes$/)
    if (sessionNotesMatch && method === 'GET') {
      return options.sessionNotes(decodeURIComponent(sessionNotesMatch[1]), signal)
    }

    if (url.pathname === '/api/user-notes' && method === 'GET') {
      userNotesCalls += 1
      return options.userNotes?.(signal, userNotesCalls)
        ?? success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
    }

    const noteMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/)
    if (noteMatch && method === 'PATCH') {
      return options.updateNote?.(decodeURIComponent(noteMatch[1]))
        ?? noteResponse(Number(noteMatch[1]), '# 저장됨')
    }
    if (noteMatch && method === 'DELETE') {
      return options.deleteNote?.() ?? new Response(null, { status: 204 })
    }

    return new Response(null, { status: 404 })
  })
}

function session(sessionId: number, materialTitle = `자료 ${sessionId}.pdf`) {
  return {
    currentPage: 1,
    materialId: sessionId,
    materialTitle,
    sessionId,
    status: 'ACTIVE',
    updatedAt: '2026-10-03T00:00:00Z',
  }
}

const ownerOne: AuthUser = {
  email: 'owner-one@example.com',
  id: 1,
  name: 'owner one',
  role: 'LEARNER',
}

function renderOwnerSwitchingNotesPage() {
  return render(
    <MemoryRouter>
      <AuthProvider initialUser={ownerOne}>
        <ToastProvider>
          <OwnerSwitcher />
          <LearnerNotesPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function OwnerSwitcher() {
  const { updateUser } = useAuth()
  return (
    <button
      onClick={() => updateUser({
        email: 'owner-two@example.com',
        id: 2,
        name: 'owner two',
        role: 'LEARNER',
      })}
      type="button"
    >
      소유자 교체
    </button>
  )
}

function manualNote(id: string, content: string) {
  return {
    content,
    createdAt: '2026-10-03T00:00:00Z',
    id,
    updatedAt: '2026-10-03T00:00:00Z',
  }
}

function notesResponse(noteId: number, content: string) {
  return success({
    items: [{ content, noteId, pageNumber: 1 }],
    page: 0,
    size: 100,
    totalElements: 1,
    totalPages: 1,
  })
}

function noteResponse(noteId: number, content: string) {
  return success({ content, noteId, pageNumber: 1 })
}

function userNotesResponse(id: number, content: string) {
  return success({
    items: [{
      content,
      createdAt: '2026-10-03T00:00:00Z',
      id,
      title: content.replace(/^#\s*/, ''),
      updatedAt: '2026-10-03T00:00:00Z',
    }],
    page: 0,
    size: 100,
    totalElements: 1,
    totalPages: 1,
  })
}

function apiError(status: number, message: string) {
  return new Response(JSON.stringify({
    error: { code: 'SERVER_ERROR', details: [], message },
    success: false,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function success(data: unknown) {
  return new Response(JSON.stringify({
    data,
    message: '요청이 성공했습니다.',
    success: true,
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function countRequests(pathname: string, method = 'GET') {
  return vi.mocked(globalThis.fetch).mock.calls.filter(([input, init]) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'http://localhost',
    )
    const requestMethod = input instanceof Request ? input.method : init?.method ?? 'GET'
    return url.pathname === pathname && requestMethod === method
  }).length
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}
