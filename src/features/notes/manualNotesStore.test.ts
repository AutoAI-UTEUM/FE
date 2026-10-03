import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiSuccess } from '../../shared/api'
import {
  createManualNotesStore,
  getManualNotesStorageKey,
  getNotePreview,
  type ManualNote,
} from './manualNotesStore'

const USER = 7
const PENDING_KEY = getManualNotesStorageKey(USER)

interface Call {
  body?: unknown
  method: string
  path: string
}

function localNote(id: string, content: string): ManualNote {
  return {
    content,
    createdAt: '2026-09-01T00:00:00Z',
    id,
    updatedAt: '2026-09-01T00:00:00Z',
  }
}

/** 경로별 응답을 미리 정해두고 호출을 기록한다. */
function stubRequest(handlers: Record<string, unknown>) {
  const calls: Call[] = []
  const request = vi.fn(async (path: string, options?: { body?: unknown; method?: string }) => {
    const method = options?.method ?? 'GET'
    calls.push({ body: options?.body, method, path })
    const key = `${method} ${path.split('?')[0]}`
    if (!(key in handlers)) throw new Error(`대비하지 않은 호출: ${key}`)
    const value = handlers[key]
    if (value instanceof Error) throw value
    return { data: value, message: '정상', success: true } as ApiSuccess<never>
  })
  return { calls, request: request as never }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.clear()
})

describe('createManualNotesStore — user-notes capability 꺼짐', () => {
  it('서버를 부르지 않고 로컬만 쓴다', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', '')
    const { calls, request } = stubRequest({})
    const store = createManualNotesStore(request, USER)

    await store.create({ content: '# 첫 노트\n본문' })
    expect(calls).toHaveLength(0)
    expect(await store.list()).toHaveLength(1)
    expect(await store.migrate()).toBeNull()
  })

  it('계정별 저장 키를 분리한다', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', '')
    const { request } = stubRequest({})
    const firstUserStore = createManualNotesStore(request, USER)
    const secondUserStore = createManualNotesStore(request, USER + 1)

    await firstUserStore.create({ content: '# 첫 번째 계정 노트' })
    await secondUserStore.create({ content: '# 두 번째 계정 노트' })

    expect(firstUserStore.readLocal().map((note) => note.content)).toEqual([
      '# 첫 번째 계정 노트',
    ])
    expect(secondUserStore.readLocal().map((note) => note.content)).toEqual([
      '# 두 번째 계정 노트',
    ])
    expect(window.localStorage.getItem(getManualNotesStorageKey(USER))).not.toBe(
      window.localStorage.getItem(getManualNotesStorageKey(USER + 1)),
    )
  })
})

describe('createManualNotesStore — user-notes capability 켜짐', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_CAPABILITIES', 'user-notes')
  })

  it('저장할 때 제목을 본문에서 뽑고 clientId를 함께 보낸다', async () => {
    const { calls, request } = stubRequest({
      'POST /api/user-notes': {
        content: '# 핵심 정리\n내용',
        createdAt: '2026-09-26T00:00:00Z',
        id: 11,
        title: '핵심 정리',
        updatedAt: '2026-09-26T00:00:00Z',
      },
    })
    const store = createManualNotesStore(request, USER)

    await store.create({ content: '  # 핵심 정리\n내용  ' })

    const body = calls[0].body as { clientId: string; content: string; title: string }
    expect(body.title).toBe('핵심 정리')
    expect(body.content).toBe('# 핵심 정리\n내용')
    expect(body.clientId).toMatch(/[0-9a-f-]{8,}/)
  })

  it('서버 저장 성공 뒤 캐시 쓰기가 실패해도 저장 성공을 반환한다', async () => {
    const { calls, request } = stubRequest({
      'POST /api/user-notes': {
        content: '# 서버에 저장된 노트',
        createdAt: '2026-09-26T00:00:00Z',
        id: 12,
        title: '서버에 저장된 노트',
        updatedAt: '2026-09-26T00:00:00Z',
      },
    })
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'edupilot:manual-notes:cache:7') {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
      originalSetItem.call(this, key, value)
    })
    const store = createManualNotesStore(request, USER)

    await expect(
      store.create({ content: '# 서버에 저장된 노트' }),
    ).resolves.toEqual({ cacheWriteFailed: true })
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })

  it('이관에 성공한 노트만 로컬에서 지우고 실패한 노트는 목록에 남긴다', async () => {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([localNote('uuid-ok', '# 옮겨질 노트'), localNote('uuid-bad', '# 실패할 노트')]),
    )
    const { calls, request } = stubRequest({
      'GET /api/user-notes': {
        items: [
          {
            content: '# 옮겨질 노트',
            createdAt: '2026-09-01T00:00:00Z',
            id: 21,
            title: '옮겨질 노트',
            updatedAt: '2026-09-01T00:00:00Z',
          },
        ],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      },
      'POST /api/user-notes/import': {
        failed: [{ clientId: 'uuid-bad', reason: 'NOTE_TOO_LARGE' }],
        imported: 1,
        skipped: 0,
      },
    })
    const store = createManualNotesStore(request, USER)

    const result = await store.migrate()
    expect(result).toEqual({
      failed: [{ clientId: 'uuid-bad', reason: 'NOTE_TOO_LARGE' }],
      imported: 1,
      skipped: 0,
    })
    // clientId는 이관 항목마다 필수다.
    const body = calls[0].body as { notes: Array<{ clientId: string }>; wrongAnswers: unknown[] }
    expect(body.notes.map((note) => note.clientId)).toEqual(['uuid-ok', 'uuid-bad'])
    // 로컬에 오답 노트를 저장한 적이 없어 보낼 게 없다.
    expect(body.wrongAnswers).toEqual([])

    expect(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '[]')).toHaveLength(1)
    const listed = await store.list()
    expect(listed.map((note) => note.id)).toEqual(['21', 'uuid-bad'])
    expect(listed.find((note) => note.id === 'uuid-bad')?.pendingImport).toBe(true)
  })

  it('이관 호출이 실패하면 로컬 노트를 지우지 않는다', async () => {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify([localNote('uuid-ok', '# 노트')]))
    const { request } = stubRequest({
      'POST /api/user-notes/import': new Error('429 rate limited'),
    })
    const store = createManualNotesStore(request, USER)

    await expect(store.migrate()).rejects.toThrow('429')
    expect(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '[]')).toHaveLength(1)
    expect(store.readLocal().map((note) => note.id)).toEqual(['uuid-ok'])
  })

  it('이관 대기 노트 수정은 서버를 부르지 않는다', async () => {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify([localNote('uuid-bad', '# 예전 노트')]))
    const { calls, request } = stubRequest({})
    const store = createManualNotesStore(request, USER)

    await store.update('uuid-bad', { content: '# 고친 노트' })

    expect(calls).toHaveLength(0)
    expect(store.readLocal()[0].content).toBe('# 고친 노트')
  })

  it('서버 응답에 없는 에디터 문서는 캐시에서 되살린다', async () => {
    const noteDto = {
      content: '# 서버 노트',
      createdAt: '2026-09-01T00:00:00Z',
      id: 31,
      title: '서버 노트',
      updatedAt: '2026-09-01T00:00:00Z',
    }
    const { request } = stubRequest({
      'GET /api/user-notes': { items: [noteDto], page: 0, size: 100, totalElements: 1, totalPages: 1 },
      'POST /api/user-notes': noteDto,
    })
    const store = createManualNotesStore(request, USER)

    await store.create({ content: '# 서버 노트', document: '{"blocks":1}' })
    expect((await store.list())[0].document).toBe('{"blocks":1}')
  })

  it('101번째 서버 노트까지 조회하고 완성된 목록만 계정 캐시에 기록한다', async () => {
    const makeNote = (id: number) => ({
      content: `# 서버 노트 ${id}`,
      createdAt: '2026-10-01T00:00:00Z',
      id,
      title: `서버 노트 ${id}`,
      updatedAt: '2026-10-01T00:00:00Z',
    })
    const request = vi.fn(async (path: string) => {
      const pageIndex = Number(new URL(path, 'https://example.test').searchParams.get('page'))
      return {
        data: {
          items: pageIndex === 0
            ? Array.from({ length: 100 }, (_, index) => makeNote(index + 1))
            : [makeNote(101)],
          page: pageIndex,
          size: 100,
          totalElements: 101,
          totalPages: 2,
        },
        message: '정상',
        success: true as const,
      }
    })
    const store = createManualNotesStore(request as never, USER)

    await expect(store.get('101')).resolves.toMatchObject({ id: '101' })
    expect(request).toHaveBeenCalledTimes(2)
    expect(store.readLocal()).toHaveLength(101)
    expect(store.readLocal().at(-1)?.id).toBe('101')
  })

  it('후속 페이지 실패 시 부분 목록으로 캐시를 덮거나 없는 노트로 판정하지 않는다', async () => {
    const cached = localNote('cached', '# 기존 캐시')
    window.localStorage.setItem(
      'edupilot:manual-notes:cache:7',
      JSON.stringify([cached]),
    )
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      content: `# 서버 노트 ${index + 1}`,
      createdAt: '2026-10-01T00:00:00Z',
      id: index + 1,
      title: `서버 노트 ${index + 1}`,
      updatedAt: '2026-10-01T00:00:00Z',
    }))
    const request = vi.fn()
      .mockResolvedValueOnce({
        data: { items: firstPage, page: 0, size: 100, totalElements: 101, totalPages: 2 },
      })
      .mockRejectedValueOnce(new Error('second page failed'))
    const store = createManualNotesStore(request as never, USER)

    await expect(store.get('101')).rejects.toThrow('second page failed')
    expect(store.readLocal()).toEqual([cached])
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/user-notes?page=0&size=100',
      '/api/user-notes?page=1&size=100',
    ])
  })

  it('owner 변경으로 abort된 이전 조회는 어느 계정 캐시도 갱신하지 않는다', async () => {
    const controller = new AbortController()
    const firstRequest = vi.fn(async () => {
      controller.abort()
      return {
        data: {
          items: Array.from({ length: 100 }, (_, index) => ({
            content: `# 이전 계정 노트 ${index + 1}`,
            createdAt: '2026-10-01T00:00:00Z',
            id: index + 1,
            title: `이전 계정 노트 ${index + 1}`,
            updatedAt: '2026-10-01T00:00:00Z',
          })),
          page: 0,
          size: 100,
          totalElements: 101,
          totalPages: 2,
        },
      }
    })
    const secondRequest = vi.fn().mockResolvedValue({
      data: {
        items: [{
          content: '# 새 계정 노트',
          createdAt: '2026-10-01T00:00:00Z',
          id: 201,
          title: '새 계정 노트',
          updatedAt: '2026-10-01T00:00:00Z',
        }],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      },
    })
    const firstOwnerStore = createManualNotesStore(firstRequest as never, USER)
    const secondOwnerStore = createManualNotesStore(secondRequest as never, USER + 1)

    await expect(firstOwnerStore.list(controller.signal)).rejects.toThrow()
    await expect(secondOwnerStore.list()).resolves.toEqual([
      expect.objectContaining({ id: '201' }),
    ])
    expect(firstOwnerStore.readLocal()).toEqual([])
    expect(secondOwnerStore.readLocal()).toEqual([
      expect.objectContaining({ id: '201' }),
    ])
    expect(firstRequest).toHaveBeenCalledOnce()
  })
})

describe('getNotePreview', () => {
  it('첫 비어 있지 않은 줄에서 마크다운 표시를 걷어낸다', () => {
    expect(getNotePreview('\n\n## **핵심** 정리\n본문').title).toBe('핵심 정리')
    expect(getNotePreview('   ').title).toBe('제목 없는 노트')
  })

  it('서버 제한인 200자로 자른다', () => {
    expect(getNotePreview('가'.repeat(300)).title).toHaveLength(200)
  })
})
