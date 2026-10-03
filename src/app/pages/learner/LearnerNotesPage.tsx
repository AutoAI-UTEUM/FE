import { ArrowLeft, ChevronDown, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createManualNotesStore,
  createNotesRepository,
  getNotePreview,
  type ManualNote,
  type Note,
} from '../../../features/notes'
import {
  createSessionsRepository,
  type LearningSession,
} from '../../../features/sessions'
import { ApiClientError, getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  Button,
  ButtonLink,
  EmptyState,
  PageContainer,
  PageHeader,
  useToast,
} from '../../../shared/ui'
import { MarkdownContent } from '../../../shared/ui/MarkdownContent'
import { noteEditPath, routes, sessionDetailPath } from '../../routes'

const NotionBlockEditor = lazy(
  () => import('../../../shared/ui/NotionBlockEditor'),
)

interface SessionNoteItem {
  kind: 'session'
  note: Note
  session: LearningSession
}

type LearnerNoteItem = ManualNoteItem | SessionNoteItem

interface ManualNoteItem {
  kind: 'manual'
  note: ManualNote
}

interface LearnerNoteGroup {
  id: string
  items: LearnerNoteItem[]
  label: string
  session?: LearningSession
}

export function LearnerNotesPage() {
  usePageTitle('내 노트')
  const navigate = useNavigate()
  const { apiRequest, user } = useAuth()
  const { show: showToast } = useToast()
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const notesRepository = useMemo(
    () => createNotesRepository(apiRequest),
    [apiRequest],
  )
  const manualNotesStore = useMemo(
    () => createManualNotesStore(apiRequest, user?.id ?? user?.email ?? 'anonymous'),
    [apiRequest, user?.email, user?.id],
  )
  const unavailableSessionsStorageKey = useMemo(
    () => getUnavailableNoteSessionsStorageKey(user?.id ?? user?.email ?? 'anonymous'),
    [user?.email, user?.id],
  )
  const [sessionItems, setSessionItems] = useState<SessionNoteItem[]>([])
  const [manualNotes, setManualNotes] = useState<ManualNote[]>(() =>
    manualNotesStore.readLocal(),
  )
  const [importFailures, setImportFailures] = useState<
    Array<{ clientId: string; reason: string }>
  >([])
  const [importError, setImportError] = useState<string | null>(null)
  const [manualNotesError, setManualNotesError] = useState<string | null>(null)
  const [isShowingManualCache, setIsShowingManualCache] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedNoteKeys, setExpandedNoteKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const manualNotesOwnerControllerRef = useRef<AbortController | null>(null)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      setSessionItems(
        await loadSessionNoteItems(
          sessionsRepository,
          notesRepository,
          unavailableSessionsStorageKey,
        ),
      )
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
    await syncManualNotes()
  }

  /**
   * 이관을 먼저 끝내고 서버 목록을 읽는다.
   * 이관 호출 자체가 실패하면 아직 로컬에만 있는 노트를 서버 목록으로 덮지 않는다.
   */
  async function syncManualNotes() {
    const ownerController = manualNotesOwnerControllerRef.current
    if (!ownerController) return
    const isCurrentOwner = () =>
      manualNotesOwnerControllerRef.current === ownerController
      && !ownerController.signal.aborted

    setImportError(null)
    setManualNotesError(null)
    try {
      const result = await manualNotesStore.migrate()
      if (!isCurrentOwner()) return
      setImportFailures(result?.failed ?? [])
    } catch (requestError) {
      if (!isCurrentOwner()) return
      setManualNotes(manualNotesStore.readLocal())
      setImportError(getRequestErrorMessage(requestError))
      return
    }
    try {
      const notes = await manualNotesStore.list(ownerController.signal)
      if (!isCurrentOwner()) return
      setManualNotes(notes)
      setIsShowingManualCache(false)
    } catch (requestError) {
      if (!isCurrentOwner()) return
      setManualNotes(manualNotesStore.readLocal())
      setManualNotesError(getRequestErrorMessage(requestError))
      setIsShowingManualCache(true)
    }
  }

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    loadSessionNoteItems(
      sessionsRepository,
      notesRepository,
      unavailableSessionsStorageKey,
      controller.signal,
    )
      .then((items) => {
        if (!cancelled) setSessionItems(items)
      })
      .catch((requestError) => {
        if (!cancelled && !controller.signal.aborted) {
          setError(getRequestErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [notesRepository, sessionsRepository, unavailableSessionsStorageKey])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    manualNotesOwnerControllerRef.current = controller
    void (async () => {
      try {
        const result = await manualNotesStore.migrate()
        if (cancelled) return
        setImportFailures(result?.failed ?? [])
      } catch (requestError) {
        if (cancelled) return
        setManualNotes(manualNotesStore.readLocal())
        setImportError(getRequestErrorMessage(requestError))
        return
      }
      try {
        const notes = await manualNotesStore.list(controller.signal)
        if (!cancelled) {
          setManualNotes(notes)
          setIsShowingManualCache(false)
        }
      } catch (requestError) {
        if (!cancelled) {
          setManualNotes(manualNotesStore.readLocal())
          setManualNotesError(getRequestErrorMessage(requestError))
          setIsShowingManualCache(true)
        }
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
      if (manualNotesOwnerControllerRef.current === controller) {
        manualNotesOwnerControllerRef.current = null
      }
    }
  }, [manualNotesStore])

  const allItems = useMemo<LearnerNoteItem[]>(
    () => [
      ...manualNotes.map((note): ManualNoteItem => ({ kind: 'manual', note })),
      ...sessionItems,
    ],
    [manualNotes, sessionItems],
  )

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR')
    if (!normalized) return allItems
    return allItems.filter((item) => {
      const content = getNoteContent(item).toLocaleLowerCase('ko-KR')
      const source = getNoteSourceLabel(item).toLocaleLowerCase('ko-KR')
      return content.includes(normalized) || source.includes(normalized)
    })
  }, [allItems, query])
  const groupedItems = useMemo(
    () => groupNoteItems(filteredItems),
    [filteredItems],
  )

  async function deleteNote(item: LearnerNoteItem) {
    if (!window.confirm('이 노트를 삭제할까요?')) return
    try {
      if (item.kind === 'manual') {
        await manualNotesStore.remove(item.note.id)
        setManualNotes((current) =>
          current.filter((note) => note.id !== item.note.id),
        )
      } else {
        await notesRepository.delete(item.note.id)
        setSessionItems((current) =>
          current.filter((currentItem) => currentItem.note.id !== item.note.id),
        )
      }
      showToast('노트를 삭제했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  function toggleNote(noteKey: string) {
    setExpandedNoteKeys((current) => {
      const next = new Set(current)
      if (next.has(noteKey)) next.delete(noteKey)
      else next.add(noteKey)
      return next
    })
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <label className="relative w-full min-w-56 sm:w-72">
              <span className="sr-only">노트 검색</span>
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
                size={14}
              />
              <input
                className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-9 type-body outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="노트 검색"
                value={query}
              />
              {query ? (
                <button
                  aria-label="검색어 지우기"
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100"
                  onClick={() => setQuery('')}
                  type="button"
                >
                  <X size={13} />
                </button>
              ) : null}
            </label>
            <ButtonLink to={routes.newNote}>
              <Plus aria-hidden="true" size={15} />
              새 노트
            </ButtonLink>
          </div>
        }
        title="내 노트"
      />

      {!manualNotesStore.usesServer ? (
        <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 type-body text-stone-700">
          직접 작성한 노트는 이 브라우저의 현재 계정에서만 사용할 수 있습니다.
        </p>
      ) : null}

      {manualNotesError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 type-body text-amber-900"
          role="alert"
        >
          <span>
            {isShowingManualCache && manualNotes.length > 0
              ? '서버 노트를 불러오지 못해 이 브라우저에 저장된 캐시를 표시합니다.'
              : '서버 노트를 불러오지 못했으며 이 브라우저에 저장된 캐시도 없습니다.'}
            <span className="ml-1">{manualNotesError}</span>
          </span>
          <Button onClick={() => void syncManualNotes()} size="sm" variant="secondary">
            서버 노트 다시 시도
          </Button>
        </div>
      ) : null}

      {/* 이관 실패는 화면을 막지 않는다. 노트는 로컬에 남아 있고 다시 시도할 수 있다. */}
      {importError || importFailures.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 type-body text-amber-900"
          role="alert"
        >
          <span>
            {importError
              ? `노트를 서버로 옮기지 못했습니다. ${importError}`
              : `노트 ${importFailures.length}개를 서버로 옮기지 못했습니다. (${[...new Set(importFailures.map((failure) => failure.reason))].join(', ')})`}
          </span>
          <Button onClick={() => void syncManualNotes()} size="sm" variant="secondary">
            다시 시도
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="py-16 text-center type-body text-stone-500" role="status">
          노트를 불러오는 중입니다.
        </p>
      ) : null}
      {error ? (
        <EmptyState
          action={<Button onClick={() => void load()}>다시 시도</Button>}
          description={error}
          title="노트를 불러오지 못했습니다"
        />
      ) : null}
      {!isLoading && !error && !manualNotesError && filteredItems.length === 0 ? (
        <EmptyState
          action={!query.trim() ? <ButtonLink to={routes.newNote}>새 노트 작성</ButtonLink> : undefined}
          description={
            query.trim()
              ? '다른 검색어로 다시 찾아보세요.'
              : '학습 중 저장한 AI 답변과 직접 작성한 노트가 이곳에 모입니다.'
          }
          title={query.trim() ? '일치하는 노트가 없습니다' : '저장한 노트가 없습니다'}
        />
      ) : null}

      {!error && filteredItems.length > 0 ? (
        <section aria-label="저장한 노트" className="grid gap-3 lg:grid-cols-2">
          {groupedItems.map((group) => (
            <article
              aria-label={`${group.label} 노트 모음`}
              className="min-w-0 self-start overflow-hidden rounded-3xl border border-stone-200 bg-white"
              key={group.id}
            >
              <header className="flex min-h-14 items-center gap-3 border-b border-stone-200 bg-stone-50/70 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-stone-200">
                  <FileText aria-hidden="true" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate type-body font-bold text-stone-950" title={group.label}>
                    {group.label}
                  </h2>
                  <p className="type-micro text-stone-400">노트 {group.items.length}개</p>
                </div>
                {group.session ? (
                    <ButtonLink
                      className="!gap-1 !rounded-md !px-2 !py-1 type-micro"
                      size="sm"
                      to={sessionDetailPath(group.session.id)}
                      variant="secondary"
                    >
                      <FileText aria-hidden="true" size={12} />
                      자료로 이동
                    </ButtonLink>
                  ) : null}
              </header>
              <div className="divide-y divide-stone-100">
                {group.items.map((item) => {
                  const noteKey = getNoteKey(item)
                  const content = getNoteContent(item)
                  const preview = getNotePreview(content)
                  const isExpanded = expandedNoteKeys.has(noteKey)
                  const contentId = `note-content-${noteKey}`
                  const noteMeta = item.kind === 'manual'
                    ? '직접 작성'
                    : [
                        item.note.pageNumber ? `${item.note.pageNumber}페이지` : null,
                        item.note.sourceMessageId ? 'AI 답변 저장' : '내 메모',
                      ].filter(Boolean).join(' · ')

                  return (
                    <section key={noteKey}>
                      <div className="flex min-w-0 items-center gap-2 px-4 py-3">
                        <button
                          aria-controls={contentId}
                          aria-expanded={isExpanded}
                          aria-label={`${preview.title} 노트 ${isExpanded ? '접기' : '펼치기'}`}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left"
                          onClick={() => toggleNote(noteKey)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate type-control font-bold text-stone-900">{preview.title}</span>
                            <span className="mt-0.5 block type-micro text-stone-400">{noteMeta}</span>
                          </span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`shrink-0 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            size={15}
                          />
                        </button>
                        <button
                          aria-label="노트 수정"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                          onClick={() => navigate(noteEditPath(
                            item.kind,
                            item.note.id,
                            item.kind === 'session' ? item.session.id : undefined,
                          ))}
                          type="button"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          aria-label="노트 삭제"
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => void deleteNote(item)}
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div id={contentId}>
                        {isExpanded && preview.body ? (
                          <MarkdownContent
                            className="border-t border-stone-100 px-4 py-4 text-stone-700"
                            content={preview.body}
                          />
                        ) : null}
                      </div>
                    </section>
                  )
                })}
              </div>
            </article>
          ))}
        </section>
      ) : null}

    </PageContainer>
  )
}

export function LearnerNoteCreatePage() {
  usePageTitle('새 노트 작성')
  const location = useLocation()
  const navigate = useNavigate()
  const { apiRequest, user } = useAuth()
  const { show: showToast } = useToast()
  const manualNotesStore = useMemo(
    () => createManualNotesStore(apiRequest, user?.id ?? user?.email ?? 'anonymous'),
    [apiRequest, user?.email, user?.id],
  )
  const initialContent = getInitialNoteContent(location.state)
  const [content, setContent] = useState(initialContent)
  const [document, setDocument] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)

  async function saveNote() {
    if (!content.trim() || isSaving) return
    setIsSaving(true)
    try {
      const result = await manualNotesStore.create({ content, document })
      showToast(
        result.cacheWriteFailed
          ? '노트는 서버에 저장됐지만 이 브라우저의 캐시를 갱신하지 못했습니다.'
          : '노트를 추가했습니다.',
        result.cacheWriteFailed ? 'info' : 'success',
      )
      navigate(routes.notes)
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink to={routes.notes} variant="secondary">
              <ArrowLeft aria-hidden="true" size={15} />
              목록으로
            </ButtonLink>
            <Button disabled={!content.trim() || isSaving} onClick={() => void saveNote()}>
              {isSaving ? '저장 중' : '저장'}
            </Button>
          </div>
        }
        title="새 노트 작성"
        titleAccessory={
          <p className="type-caption text-stone-400">
            제목, 토글, 구분선, 목록을 사용해 자유롭게 정리하세요.
          </p>
        }
      />
      <section className="min-h-[calc(100dvh-13rem)] rounded-lg border border-stone-200 bg-white p-5">
        <Suspense fallback={<EditorLoadingState />}>
          <NotionBlockEditor
            ariaLabel="새 노트 내용"
            className="min-h-[calc(100dvh-16rem)]"
            initialDocument={document}
            initialValue={content}
            key={initialContent}
            onChange={(markdown, nextDocument) => {
              setContent(markdown)
              setDocument(nextDocument)
            }}
          />
        </Suspense>
      </section>
    </PageContainer>
  )
}

function getInitialNoteContent(state: unknown) {
  if (!state || typeof state !== 'object' || !('initialContent' in state)) return '# 새 노트\n\n'
  const initialContent = (state as { initialContent?: unknown }).initialContent
  return typeof initialContent === 'string' && initialContent.trim()
    ? initialContent
    : '# 새 노트\n\n'
}

export function LearnerNoteEditPage() {
  usePageTitle('노트 수정')
  const navigate = useNavigate()
  const { noteId = '', noteKind = '' } = useParams()
  const [searchParams] = useSearchParams()
  const sourceSessionId = searchParams.get('sessionId')
  const { apiRequest, user } = useAuth()
  const { show: showToast } = useToast()
  const notesRepository = useMemo(
    () => createNotesRepository(apiRequest),
    [apiRequest],
  )
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const manualNotesStore = useMemo(
    () => createManualNotesStore(apiRequest, user?.id ?? user?.email ?? 'anonymous'),
    [apiRequest, user?.email, user?.id],
  )
  const unavailableSessionsStorageKey = useMemo(
    () => getUnavailableNoteSessionsStorageKey(user?.id ?? user?.email ?? 'anonymous'),
    [user?.email, user?.id],
  )
  const [content, setContent] = useState('')
  const [document, setDocument] = useState<string | undefined>()
  const [sourceLabel, setSourceLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadNote() {
      setIsLoading(true)
      setError(null)
      try {
        if (noteKind === 'manual') {
          const note = await manualNotesStore.get(noteId)
          if (!note) throw new Error('수정할 노트를 찾을 수 없습니다.')
          if (!cancelled) {
            setContent(note.content)
            setDocument(note.document)
            setSourceLabel('개인 노트')
          }
          return
        }

        if (noteKind !== 'session') throw new Error('잘못된 노트 경로입니다.')
        const sessionItems = await loadSessionNoteItems(
          sessionsRepository,
          notesRepository,
          unavailableSessionsStorageKey,
          undefined,
          sourceSessionId,
        )
        const match = sessionItems.find((item) => item.note.id === noteId)
        if (!match) throw new Error('수정할 노트를 찾을 수 없습니다.')
        if (!cancelled) {
          setContent(match.note.content)
          setDocument(undefined)
          setSourceLabel(match.session.materialTitle)
        }
      } catch (requestError) {
        if (!cancelled) setError(getRequestErrorMessage(requestError))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadNote()
    return () => {
      cancelled = true
    }
  }, [manualNotesStore, noteId, noteKind, notesRepository, sessionsRepository, sourceSessionId, unavailableSessionsStorageKey])

  async function saveNote() {
    if (!content.trim() || isSaving) return
    setIsSaving(true)
    try {
      if (noteKind === 'manual') {
        await manualNotesStore.update(noteId, { content, document })
      } else if (noteKind === 'session') {
        await notesRepository.update(noteId, content.trim())
      } else {
        throw new Error('잘못된 노트 경로입니다.')
      }
      showToast('노트를 수정했습니다.', 'success')
      navigate(routes.notes)
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink to={routes.notes} variant="secondary">
              <ArrowLeft aria-hidden="true" size={15} />
              목록으로
            </ButtonLink>
            <Button disabled={isLoading || !content.trim() || isSaving} onClick={() => void saveNote()}>
              {isSaving ? '저장 중' : '변경사항 저장'}
            </Button>
          </div>
        }
        title="노트 수정"
        titleAccessory={sourceLabel ? <p className="type-caption text-stone-400">{sourceLabel}</p> : undefined}
      />
      {isLoading ? <EditorLoadingState /> : null}
      {!isLoading && error ? (
        <EmptyState
          action={<ButtonLink to={routes.notes}>목록으로</ButtonLink>}
          description={error}
          title="노트를 불러오지 못했습니다"
        />
      ) : null}
      {!isLoading && !error ? (
        <section className="min-h-[calc(100dvh-13rem)] rounded-lg border border-stone-200 bg-white p-5">
          <Suspense fallback={<EditorLoadingState />}>
            <NotionBlockEditor
              ariaLabel="노트 내용 수정"
              className="min-h-[calc(100dvh-16rem)]"
              initialDocument={document}
              initialValue={content}
              key={`${noteKind}-${noteId}`}
              onChange={(markdown, nextDocument) => {
                setContent(markdown)
                setDocument(nextDocument)
              }}
            />
          </Suspense>
        </section>
      ) : null}
    </PageContainer>
  )
}

function EditorLoadingState() {
  return (
    <div
      className="flex mobile-web:min-h-0 min-h-[420px] items-center justify-center rounded-lg border border-stone-200 bg-stone-50 type-body text-stone-500"
      role="status"
    >
      편집기를 불러오는 중입니다.
    </div>
  )
}

function getNoteKey(item: LearnerNoteItem): string {
  return `${item.kind}-${item.note.id}`
}

function getNoteContent(item: LearnerNoteItem): string {
  return item.note.content
}

function getNoteSourceLabel(item: LearnerNoteItem): string {
  return item.kind === 'manual' ? '개인 노트' : item.session.materialTitle
}

function groupNoteItems(items: LearnerNoteItem[]): LearnerNoteGroup[] {
  const groups = new Map<string, LearnerNoteGroup>()

  items.forEach((item) => {
    const groupId = item.kind === 'manual'
      ? 'manual'
      : `material-${item.session.materialId ?? item.session.materialTitle}`
    const current = groups.get(groupId)
    if (current) {
      current.items.push(item)
      return
    }
    groups.set(groupId, {
      id: groupId,
      items: [item],
      label: getNoteSourceLabel(item),
      session: item.kind === 'session' ? item.session : undefined,
    })
  })

  return [...groups.values()]
}

type NotesRepository = ReturnType<typeof createNotesRepository>
type SessionsRepository = ReturnType<typeof createSessionsRepository>

const NOTE_REQUEST_CONCURRENCY = 4
const UNAVAILABLE_SESSION_CACHE_LIMIT = 200

async function loadSessionNoteItems(
  sessionsRepository: SessionsRepository,
  notesRepository: NotesRepository,
  unavailableSessionsStorageKey: string,
  signal?: AbortSignal,
  sourceSessionId?: string | null,
): Promise<SessionNoteItem[]> {
  const sessions = (await sessionsRepository.list(signal)).filter(
    (session) => session.status !== 'DELETED'
      && (sourceSessionId ? session.id === sourceSessionId : true),
  )
  const unavailableSessionIds = readUnavailableSessionIds(unavailableSessionsStorageKey)
  const availableSessions = sessions.filter(
    (session) => !unavailableSessionIds.has(session.id),
  )
  const notesBySession = await mapWithConcurrency(
    availableSessions,
    NOTE_REQUEST_CONCURRENCY,
    async (session) => {
      try {
        return {
          notes: await notesRepository.listForSession(session.id, signal),
          session,
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          unavailableSessionIds.add(session.id)
        }
        return { notes: [], session }
      }
    },
  )
  persistUnavailableSessionIds(unavailableSessionsStorageKey, unavailableSessionIds)
  return notesBySession.flatMap(({ notes, session }) =>
    notes.map((note): SessionNoteItem => ({ kind: 'session', note, session })),
  )
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await task(items[currentIndex])
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  )
  return results
}

function getUnavailableNoteSessionsStorageKey(userId: string | number): string {
  return `uteum:notes:unavailable-sessions:${String(userId)}`
}

function readUnavailableSessionIds(storageKey: string): Set<string> {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '[]') as unknown
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function persistUnavailableSessionIds(storageKey: string, sessionIds: Set<string>) {
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify([...sessionIds].slice(-UNAVAILABLE_SESSION_CACHE_LIMIT)),
    )
  } catch {
    // Browsers can disable session storage; note loading should still continue.
  }
}
