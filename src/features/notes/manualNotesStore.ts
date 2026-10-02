import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
import type { AuthenticatedRequest } from '../auth'
import {
  createUserNotesRepository,
  NOTE_IMPORT_BATCH_LIMIT,
  type NoteImportResult,
  type UserNote,
} from './userNotesRepository'

/** 손으로 쓴 개인 노트. 서버 전환 전에 저장된 로컬 데이터와 같은 모양을 유지한다. */
export interface ManualNote {
  content: string
  createdAt: string
  /**
   * 블록 에디터의 문서 표현. 서버 계약에 없는 값이라 서버 전환 후에도 로컬에만 둔다.
   * 없으면 에디터가 content(마크다운)에서 다시 만든다.
   */
  document?: string
  id: string
  /** 아직 서버로 옮기지 못한 노트. 이관을 다시 시도할 대상이다. */
  pendingImport?: boolean
  updatedAt: string
}

export interface NotePreview {
  body: string
  title: string
}

export interface ManualNotesStore {
  create: (input: { content: string; document?: string }) => Promise<{
    cacheWriteFailed: boolean
  }>
  get: (noteId: string) => Promise<ManualNote | undefined>
  list: (signal?: AbortSignal) => Promise<ManualNote[]>
  /** 서버 조회 없이 즉시 읽는다. 첫 렌더와 이관 실패 시 쓴다. */
  readLocal: () => ManualNote[]
  remove: (noteId: string) => Promise<void>
  /** 이관할 게 없거나 이미 끝났으면 null. */
  migrate: () => Promise<NoteImportResult | null>
  update: (
    noteId: string,
    input: { content: string; document?: string },
  ) => Promise<void>
  usesServer: boolean
}

/**
 * 이관 대기 중인 노트. 기존 키를 그대로 쓴다.
 * 바꾸면 이관 직전에 사용자의 로컬 노트가 사라진다.
 */
export function getManualNotesStorageKey(userId: number | string): string {
  return `edupilot:manual-notes:${String(userId)}`
}

/** 서버 노트의 오프라인 캐시. 이관 대기 노트와 섞이지 않게 키를 나눈다. */
function getServerCacheKey(userId: number | string): string {
  return `edupilot:manual-notes:cache:${String(userId)}`
}

export function createManualNotesStore(
  request: AuthenticatedRequest,
  userKey: number | string,
): ManualNotesStore {
  const pendingKey = getManualNotesStorageKey(userKey)
  const cacheKey = getServerCacheKey(userKey)
  const repository = createUserNotesRepository(request)
  const usesServer = isApiCapabilityEnabled('user-notes')

  const readPending = () => readNotes(pendingKey).map(markPending)
  const writePending = (notes: ManualNote[]) => writeNotes(pendingKey, notes)
  const readServerCache = () => readNotes(cacheKey)
  const writeServerCache = (notes: ManualNote[]) => writeNotes(cacheKey, notes)

  /** 서버 응답에는 document가 없으므로 같은 id의 캐시 값을 살려 붙인다. */
  function withCachedDocuments(notes: UserNote[]): ManualNote[] {
    const documents = new Map(
      readServerCache()
        .filter((note) => note.document)
        .map((note) => [note.id, note.document]),
    )
    return notes.map((note) => ({
      content: note.content,
      createdAt: note.createdAt,
      document: documents.get(note.id),
      id: note.id,
      updatedAt: note.updatedAt,
    }))
  }

  function readLocal(): ManualNote[] {
    return usesServer ? [...readServerCache(), ...readPending()] : readPending()
  }

  async function list(signal?: AbortSignal): Promise<ManualNote[]> {
    if (!usesServer) return readPending()
    const notes = withCachedDocuments(await repository.list(signal))
    writeServerCache(notes)
    // 이관에 실패해 아직 로컬에만 있는 노트도 계속 보여야 한다.
    return [...notes, ...readPending()]
  }

  return {
    list,
    readLocal,
    usesServer,

    async get(noteId) {
      return (await list()).find((note) => note.id === noteId)
    },

    async create({ content, document }) {
      const trimmed = content.trim()
      const now = new Date().toISOString()
      const clientId = createClientId()

      if (!usesServer) {
        writePending([
          { content: trimmed, createdAt: now, document, id: clientId, updatedAt: now },
          ...readPending(),
        ])
        return { cacheWriteFailed: false }
      }

      const created = await repository.create({
        clientId,
        content: trimmed,
        title: getNotePreview(trimmed).title,
      })
      try {
        writeServerCache([
          {
            content: created.content,
            createdAt: created.createdAt,
            document,
            id: created.id,
            updatedAt: created.updatedAt,
          },
          ...readServerCache(),
        ])
        return { cacheWriteFailed: false }
      } catch {
        // The server already committed this clientId. Do not surface a save
        // failure that would invite a second create with a new clientId.
        return { cacheWriteFailed: true }
      }
    },

    async update(noteId, { content, document }) {
      const trimmed = content.trim()
      const updatedAt = new Date().toISOString()
      const isPending = readPending().some((note) => note.id === noteId)

      // 이관 대기 노트는 서버에 아직 없으므로 로컬만 고친다.
      if (usesServer && !isPending) {
        await repository.update(noteId, {
          content: trimmed,
          title: getNotePreview(trimmed).title,
        })
        writeServerCache(
          readServerCache().map((note) =>
            note.id === noteId ? { ...note, content: trimmed, document, updatedAt } : note,
          ),
        )
        return
      }

      const pending = readPending()
      if (!pending.some((note) => note.id === noteId)) {
        throw new Error('수정할 노트를 찾을 수 없습니다.')
      }
      writePending(
        pending.map((note) =>
          note.id === noteId ? { ...note, content: trimmed, document, updatedAt } : note,
        ),
      )
    },

    async remove(noteId) {
      const pending = readPending()
      if (pending.some((note) => note.id === noteId)) {
        writePending(pending.filter((note) => note.id !== noteId))
        return
      }
      if (usesServer) await repository.remove(noteId)
      writeServerCache(readServerCache().filter((note) => note.id !== noteId))
    },

    /**
     * 최초 1회 로컬 노트를 서버로 옮긴다.
     * 성공·skip만 로컬에서 지우고 실패는 남겨 사유를 보여준 뒤 다시 시도할 수 있게 한다.
     * 오답 노트는 로컬에 저장한 적이 없어 보낼 게 없다.
     */
    async migrate() {
      if (!usesServer) return null

      const pending = readPending()
      if (pending.length === 0) return null

      const batch = pending.slice(0, NOTE_IMPORT_BATCH_LIMIT)
      const batchIds = new Set(batch.map((note) => note.id))
      const result = await repository.importLocal({
        notes: batch.map((note) => ({
          clientId: note.id,
          content: note.content,
          createdAt: note.createdAt,
          title: getNotePreview(note.content).title,
        })),
        wrongAnswers: [],
      })

      const failedIds = new Set(result.failed.map((failure) => failure.clientId))
      writePending(
        pending.filter((note) => failedIds.has(note.id) || !batchIds.has(note.id)),
      )
      return result
    },
  }
}

/** 첫 비어 있지 않은 줄을 제목으로 쓴다. 서버 title에도 같은 값을 보낸다. */
export function getNotePreview(content: string): NotePreview {
  const lines = content.split(/\r?\n/)
  const titleLineIndex = lines.findIndex((line) => line.trim())
  if (titleLineIndex < 0) return { body: '', title: '제목 없는 노트' }

  const titleLine = lines[titleLineIndex].trim()
  const title = titleLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s+#+$/, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^:::\s*toggle\s+/, '')
    .replace(/[*_~`]/g, '')
    .trim()

  return {
    body: [...lines.slice(0, titleLineIndex), ...lines.slice(titleLineIndex + 1)]
      .join('\n')
      .trim(),
    // 서버 제목 제한은 200자다.
    title: (title || '제목 없는 노트').slice(0, 200),
  }
}

function markPending(note: ManualNote): ManualNote {
  return { ...note, pendingImport: true }
}

function readNotes(storageKey: string): ManualNote[] {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(storageKey) ?? '[]',
    ) as unknown
    if (!Array.isArray(value)) return []
    return value.filter(isManualNote)
  } catch {
    return []
  }
}

/** pendingImport는 어느 키에 들어 있는지로 정해지는 표시값이라 저장하지 않는다. */
function writeNotes(storageKey: string, notes: ManualNote[]) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(
      notes.map((note) => ({
        content: note.content,
        createdAt: note.createdAt,
        document: note.document,
        id: note.id,
        updatedAt: note.updatedAt,
      })),
    ),
  )
}

function isManualNote(value: unknown): value is ManualNote {
  if (typeof value !== 'object' || value === null) return false
  const note = value as Partial<ManualNote>
  return (
    typeof note.id === 'string' &&
    typeof note.content === 'string' &&
    typeof note.createdAt === 'string' &&
    typeof note.updatedAt === 'string'
  )
}

export function createClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
