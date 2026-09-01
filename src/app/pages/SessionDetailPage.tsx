import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'

import { useAuth } from '../../features/auth'
import {
  createClassroomsRepository,
  getRememberedClassroomId,
  rememberClassroomId,
  type Classroom,
  type ClassroomWeek,
} from '../../features/classrooms'
import { ApiClientError, getRequestErrorMessage } from '../../shared/api'
import { ChatPanel, useSessionChat } from '../../features/chat'
import { DocumentChatPanel } from '../../features/documentChat'
import { createMaterialsRepository, type MaterialOverview } from '../../features/materials'
import type { QuizKind } from '../../features/quiz'
import {
  createSessionsRepository,
  movePage,
  SessionResourcePanel,
  UiActionsRenderer,
  type LearningSession,
  type SessionQuizSummary,
  type SessionResourceWeek,
  type SessionTurnResult,
  type UiAction,
  type UiActionEvent,
} from '../../features/sessions'
import type { UiActionSelection } from '../../features/sessions/UiActionsRenderer'
import {
  Button,
  ButtonLink,
  ErrorState,
  LoadingState,
} from '../../shared/ui'
import {
  classroomDetailPath,
  diagnosisPath,
  materialViewerPath,
  routes,
  sessionDetailPath,
} from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { MobileWorkspaceTabs, useResponsiveViewport } from '../../shared/responsive'
import { QuizWorkspace } from './QuizPage'

const SessionPageViewer = lazy(async () => {
  const module = await import('../../features/sessions/SessionPageViewer')
  return { default: module.SessionPageViewer }
})

const QUIZ_TYPE_OPTIONS: Array<{ kind: QuizKind; label: string }> = [
  { kind: 'MCQ', label: '객관식' },
  { kind: 'OX', label: 'OX' },
  { kind: 'SHORT', label: '단답형' },
  { kind: 'ESSAY', label: '서술형' },
]

const DEFAULT_CHAT_PANEL_WIDTH = 660
const MIN_CHAT_PANEL_WIDTH = 360
const MIN_PDF_PANEL_WIDTH = 360
const PANEL_RESIZER_WIDTH = 6
const OVERVIEW_POLL_INTERVAL_MS = 15_000
const PAGE_MOVE_DEBOUNCE_MS = 500

interface QueuedPageMove {
  pageNumber: number
  resolvers: Array<(succeeded: boolean) => void>
  suppressUiActions: boolean
}

export function SessionDetailPage() {
  usePageTitle('학습 공간')
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { apiRequest, rawApiRequest, user } = useAuth()
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest, rawApiRequest),
    [apiRequest, rawApiRequest],
  )
  const materialsRepository = useMemo(
    () => createMaterialsRepository(apiRequest, rawApiRequest),
    [apiRequest, rawApiRequest],
  )
  const classroomsRepository = useMemo(
    () => createClassroomsRepository(apiRequest),
    [apiRequest],
  )
  const [session, setSession] = useState<
    LearningSession | null | undefined
  >(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isActionPending, setIsActionPending] = useState(false)
  const [isSelectingQuizType, setIsSelectingQuizType] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [embeddedQuizId, setEmbeddedQuizId] = useState<string | null>(null)
  const [embeddedQuizReviewSummary, setEmbeddedQuizReviewSummary] = useState<SessionQuizSummary>()
  const [lockedQuizId, setLockedQuizId] = useState<string | null>(null)
  const [sessionQuizzes, setSessionQuizzes] = useState<SessionQuizSummary[]>([])
  const [sessionQuizzesError, setSessionQuizzesError] = useState<string | null>(null)
  const [isLoadingSessionQuizzes, setIsLoadingSessionQuizzes] = useState(false)
  const [resourceWeeks, setResourceWeeks] = useState<SessionResourceWeek[]>([])
  const [resourceReloadKey, setResourceReloadKey] = useState(0)
  const [materialFile, setMaterialFile] = useState<Blob | null | undefined>()
  const [materialFileError, setMaterialFileError] = useState<string | null>(null)
  const [materialOverview, setMaterialOverview] = useState<MaterialOverview | null>(null)
  const [chatPanelWidth, setChatPanelWidth] = useState<number | null>(null)
  const [chatPanelMaxWidth, setChatPanelMaxWidth] = useState(DEFAULT_CHAT_PANEL_WIDTH)
  const [isResourcePanelOpen, setIsResourcePanelOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState<'content' | 'learning'>('content')
  const { isPhone } = useResponsiveViewport()
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const autoOpenedQuizIdRef = useRef<string | null>(null)
  const currentPageRef = useRef(1)
  const pageMoveTimerRef = useRef<number | undefined>(undefined)
  const queuedPageMoveRef = useRef<QueuedPageMove | null>(null)
  const chat = useSessionChat(sessionsRepository, sessionId ?? '')
  const chatTurnPendingRef = useRef(chat.isTurnPending)
  const [resolvedClassroomId, setResolvedClassroomId] = useState<string | null>(
    () => getRememberedClassroomId(),
  )
  const weekPagePath = resolvedClassroomId
    ? classroomDetailPath(resolvedClassroomId)
    : routes.classrooms

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    chatTurnPendingRef.current = chat.isTurnPending
  }, [chat.isTurnPending])

  useEffect(() => () => {
    if (pageMoveTimerRef.current !== undefined) {
      window.clearTimeout(pageMoveTimerRef.current)
    }
    queuedPageMoveRef.current?.resolvers.forEach((resolve) => resolve(false))
    queuedPageMoveRef.current = null
  }, [])

  useEffect(() => {
    if (!sessionId) return

    const controller = new AbortController()
    sessionsRepository
      .getById(sessionId, controller.signal)
      .then(async (nextSession) => {
        if (!nextSession) {
          navigate(routes.classrooms, { replace: true })
          return
        }

        let totalPages = nextSession.totalPages
        let materialTitle = nextSession.materialTitle
        if (!totalPages && nextSession.materialId) {
          const material = await materialsRepository.getById(
            nextSession.materialId,
            controller.signal,
          )
          totalPages = material?.pageCount
          materialTitle = material?.title ?? materialTitle
        }

        const hydratedSession = withPagePromptFallback({ ...nextSession, materialTitle, totalPages })
        setSession(hydratedSession)
        currentPageRef.current = hydratedSession.currentPage
        setCurrentPage(hydratedSession.currentPage)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getRequestErrorMessage(requestError))
          setSession(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [
    materialsRepository,
    navigate,
    reloadKey,
    sessionId,
    sessionsRepository,
  ])

  useEffect(() => {
    const materialId = session?.materialId
    const controller = new AbortController()

    const loadMaterialFile = async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return

      if (!materialId) {
        setMaterialFile(null)
        setMaterialFileError(null)
        return
      }

      setMaterialFile(undefined)
      setMaterialFileError(null)
      try {
        setMaterialFile(
          await materialsRepository.getFile(materialId, controller.signal),
        )
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setMaterialFile(null)
          setMaterialFileError(getRequestErrorMessage(requestError))
        }
      }
    }

    void loadMaterialFile()
    return () => controller.abort()
  }, [materialsRepository, session?.materialId])

  useEffect(() => {
    const materialId = session?.materialId
    const controller = new AbortController()
    let pollTimeoutId: number | undefined

    const loadMaterialOverview = async (reset = false) => {
      await Promise.resolve()
      if (controller.signal.aborted) return

      if (reset) setMaterialOverview(null)

      if (!materialId) {
        setMaterialOverview(null)
        return
      }

      try {
        const overview = await materialsRepository.getOverview(materialId, controller.signal)
        if (controller.signal.aborted) return
        setMaterialOverview(overview)
        if (overview?.status === 'PENDING') {
          pollTimeoutId = window.setTimeout(
            () => void loadMaterialOverview(),
            OVERVIEW_POLL_INTERVAL_MS,
          )
        }
      } catch {
        if (!controller.signal.aborted) {
          setMaterialOverview({
            materialId,
            status: 'FAILED',
          })
        }
      }
    }

    void loadMaterialOverview(true)
    return () => {
      controller.abort()
      if (pollTimeoutId !== undefined) window.clearTimeout(pollTimeoutId)
    }
  }, [materialsRepository, session?.materialId])

  useEffect(() => {
    const activeQuizId = session?.activeQuizId
    if (!activeQuizId) {
      autoOpenedQuizIdRef.current = null
      return
    }
    if (
      session.pageStatus === 'QUIZ_READY'
      && autoOpenedQuizIdRef.current !== activeQuizId
    ) {
      autoOpenedQuizIdRef.current = activeQuizId
      setEmbeddedQuizReviewSummary(undefined)
      setLockedQuizId(activeQuizId)
      setEmbeddedQuizId(activeQuizId)
    }
  }, [session?.activeQuizId, session?.pageStatus])

  useEffect(() => {
    const activeSessionId = session?.id
    if (!activeSessionId) return

    const controller = new AbortController()
    const loadSessionQuizzes = async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return

      setIsLoadingSessionQuizzes(true)
      try {
        const quizzes = await sessionsRepository.listQuizzes(
          activeSessionId,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setSessionQuizzes(quizzes)
        setSessionQuizzesError(null)
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setSessionQuizzesError(getRequestErrorMessage(requestError))
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingSessionQuizzes(false)
      }
    }

    void loadSessionQuizzes()

    return () => controller.abort()
  }, [resourceReloadKey, session?.id, sessionsRepository])

  useEffect(() => {
    const activeSessionId = session?.id
    const activeMaterialId = session?.materialId
    if (!activeSessionId || !activeMaterialId) return

    const controller = new AbortController()
    const loadClassroomResources = async () => {
      try {
        const context = await findClassroomContext(
          classroomsRepository,
          activeMaterialId,
          getRememberedClassroomId(),
          controller.signal,
        )
        if (!context || controller.signal.aborted) {
          setResourceWeeks([])
          return
        }

        rememberClassroomId(context.classroomId)
        setResolvedClassroomId(context.classroomId)

        const listedSessions = await sessionsRepository.list(controller.signal)
        const sessions = [
          { id: activeSessionId, materialId: activeMaterialId },
          ...listedSessions.filter((item) => item.id !== activeSessionId),
        ]
        const sessionByMaterial = selectSessionsByMaterial(sessions)

        if (controller.signal.aborted) return
        const orderedWeeks = [...context.weeks].sort(
          (left, right) => left.weekNumber - right.weekNumber,
        )
        setResourceWeeks(orderedWeeks.map((week) => ({
          id: week.id,
          materials: week.materials.map((material) => {
            const materialSession = sessionByMaterial.get(material.id)
            return {
              id: material.id,
              sessionId: materialSession?.id,
              status: material.status,
              title: material.title,
            }
          }),
          title: week.title,
        })))
      } catch {
        if (!controller.signal.aborted) setResourceWeeks([])
      }
    }

    void loadClassroomResources()
    return () => controller.abort()
  }, [
    classroomsRepository,
    resourceReloadKey,
    session?.id,
    session?.materialId,
    sessionsRepository,
  ])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace || typeof ResizeObserver === 'undefined') return

    const updatePanelBounds = () => {
      const nextMaximum = Math.max(
        MIN_CHAT_PANEL_WIDTH,
        workspace.clientWidth - MIN_PDF_PANEL_WIDTH - PANEL_RESIZER_WIDTH,
      )
      setChatPanelMaxWidth(nextMaximum)
      setChatPanelWidth((width) => width === null
        ? null
        : Math.min(nextMaximum, Math.max(MIN_CHAT_PANEL_WIDTH, width)))
    }

    updatePanelBounds()
    const observer = new ResizeObserver(updatePanelBounds)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  if (!sessionId) {
    return (
      <ErrorState
        title="세션을 찾을 수 없습니다."
        description="세션 식별자가 없습니다."
        action={<ButtonLink to={routes.classrooms}>강의실로</ButtonLink>}
      />
    )
  }

  if (isLoading) {
    return <LoadingState message="학습 세션을 불러오는 중입니다." />
  }

  if (!session) {
    return (
      <ErrorState
        title="세션을 찾을 수 없습니다."
        description={error ?? '세션 목록에서 다시 선택하세요.'}
        action={
          error ? (
            <Button
              onClick={() => {
                setError(null)
                setIsLoading(true)
                setReloadKey((key) => key + 1)
              }}
              type="button"
            >
              다시 시도
            </Button>
          ) : (
            <ButtonLink to={routes.classrooms}>강의실로</ButtonLink>
          )
        }
      />
    )
  }

  const activeSession = session
  const totalPages = activeSession.totalPages ?? Math.max(activeSession.currentPage, 1)

  function applyTurnResult(result: SessionTurnResult, preservePage = false) {
    chat.clearUiActions()
    const nextPage = preservePage || result.currentPage === undefined
      ? undefined
      : movePage(result.currentPage, totalPages)
    if (nextPage !== undefined) {
      currentPageRef.current = nextPage
      setCurrentPage(nextPage)
    }
    setSession((current) => current
      ? {
          ...current,
          activeQuizId: result.activeQuizId === undefined
            ? current.activeQuizId
            : result.activeQuizId ?? undefined,
          currentPage: nextPage ?? current.currentPage,
          pageStatus: result.pageStatus ?? current.pageStatus,
          pendingDiagnosis: result.pendingDiagnosis === undefined
            ? current.pendingDiagnosis
            : result.pendingDiagnosis ?? undefined,
          uiActions: result.uiActions,
        }
      : current)
  }

  async function executePageMove(
    nextPage: number,
    suppressUiActions = false,
  ): Promise<boolean> {
    if (isActionPending || chatTurnPendingRef.current) {
      currentPageRef.current = activeSession.currentPage
      setCurrentPage(activeSession.currentPage)
      return false
    }
    const nextSafePage = movePage(nextPage, totalPages)
    setIsActionPending(true)
    setError(null)
    try {
      const result = await sessionsRepository.movePage(
        activeSession.id,
        nextSafePage,
      )
      chat.clearUiActions()
      currentPageRef.current = result.currentPage
      setCurrentPage(result.currentPage)
      setSession((current) =>
        current
          ? (suppressUiActions ? {
              ...current,
              currentPage: result.currentPage,
              pageStatus: result.pageStatus ?? 'NOT_EXPLAINED',
              uiActions: [],
            } : withPagePromptFallback({
              ...current,
              currentPage: result.currentPage,
              pageStatus: result.pageStatus ?? 'NOT_EXPLAINED',
              uiActions: result.uiActions,
            }))
          : current,
      )
      return true
    } catch (requestError) {
      if (isTurnInProgressError(requestError)) {
        setError(null)
        await chat.waitForTurnCompletion((result) => applyTurnResult(result))
      } else {
        setError(getRequestErrorMessage(requestError))
        currentPageRef.current = activeSession.currentPage
        setCurrentPage(activeSession.currentPage)
      }
      return false
    } finally {
      setIsActionPending(false)
    }
  }

  function handlePageMove(
    nextPage: number,
    suppressUiActions = false,
  ): Promise<boolean> {
    if (isActionPending || chat.isTurnPending) return Promise.resolve(false)
    const nextSafePage = movePage(nextPage, totalPages)
    currentPageRef.current = nextSafePage
    setCurrentPage(nextSafePage)

    if (pageMoveTimerRef.current !== undefined) {
      window.clearTimeout(pageMoveTimerRef.current)
    }

    return new Promise((resolve) => {
      const queued = queuedPageMoveRef.current
      queuedPageMoveRef.current = {
        pageNumber: nextSafePage,
        resolvers: [...(queued?.resolvers ?? []), resolve],
        suppressUiActions,
      }
      pageMoveTimerRef.current = window.setTimeout(() => {
        const pendingMove = queuedPageMoveRef.current
        queuedPageMoveRef.current = null
        pageMoveTimerRef.current = undefined
        if (!pendingMove) return
        void executePageMove(
          pendingMove.pageNumber,
          pendingMove.suppressUiActions,
        ).then((succeeded) => {
          pendingMove.resolvers.forEach((resolveMove) => resolveMove(succeeded))
        })
      }, PAGE_MOVE_DEBOUNCE_MS)
    })
  }

  async function handlePageNavigation(nextPage: number) {
    const nextSafePage = movePage(nextPage, totalPages)

    if (nextSafePage === currentPageRef.current) {
      if (nextPage > currentPageRef.current) setError('마지막 페이지입니다.')
      return
    }

    await handlePageMove(nextSafePage)
  }

  async function handleExplainNextPage() {
    const nextPage = movePage(currentPageRef.current + 1, totalPages)
    if (nextPage === currentPageRef.current) {
      setError('마지막 페이지입니다.')
      return
    }

    const moved = await handlePageMove(nextPage, true)
    if (moved) await runTurn('EXPLAIN_CURRENT_PAGE', { detailLevel: 'NORMAL' })
  }

  async function handleQuizDecline() {
    if (isActionPending || chat.isTurnPending) return
    setIsActionPending(true)
    setError(null)
    try {
      const result = await sessionsRepository.declineQuiz(activeSession.id)
      applyTurnResult(result, true)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsActionPending(false)
    }
  }

  async function runTurn(
    eventType: 'EXPLAIN_CURRENT_PAGE' | 'NOTE_REQUESTED' | 'QUIZ_TYPE_SELECTED',
    payload: Record<string, unknown>,
  ) {
    if (isActionPending || chat.isTurnPending) return undefined
    setIsActionPending(true)
    setError(null)
    try {
      const result = await chat.submitTurn({
        eventType,
        payload,
        requestId: createTurnRequestId(),
      })
      applyTurnResult(
        eventType === 'EXPLAIN_CURRENT_PAGE'
          ? { ...result, uiActions: normalizeProgressActions(result.uiActions) }
          : result,
        true,
      )
      return result
    } catch (requestError) {
      if (
        requestError instanceof ApiClientError &&
        requestError.code === 'TURN_ALREADY_PROCESSED'
      ) {
        // 이미 처리된 턴 — 세션 상세 재조회로 서버 상태를 복원 (스펙 §6)
        setIsLoading(true)
        setReloadKey((key) => key + 1)
      } else {
        setError(getRequestErrorMessage(requestError))
      }
      return undefined
    } finally {
      setIsActionPending(false)
    }
  }

  async function handleEvent(event: UiActionEvent, selection?: UiActionSelection) {
    if (selection?.choice === 'no' && isQuizProposal(selection.action)) {
      await handleQuizDecline()
      return
    }
    switch (event) {
      case 'MOVE_NEXT_PAGE':
        await handlePageNavigation(currentPage + 1)
        return
      case 'EXPLAIN_CURRENT_PAGE':
        await runTurn('EXPLAIN_CURRENT_PAGE', { detailLevel: 'NORMAL' })
        return
      case 'NOTE_REQUESTED':
        await runTurn('NOTE_REQUESTED', {})
        return
      case 'SHOW_QUIZ_TYPE_SELECT':
        chat.clearUiActions()
        setSession((current) => current ? { ...current, uiActions: [] } : current)
        setIsSelectingQuizType(true)
        return
      case 'COMPLETE_SESSION': {
        if (isActionPending || chat.isTurnPending) return
        setIsActionPending(true)
        setError(null)
        try {
          await sessionsRepository.complete(activeSession.id)
          navigate(weekPagePath)
        } catch (requestError) {
          setError(getRequestErrorMessage(requestError))
        } finally {
          setIsActionPending(false)
        }
        return
      }
      case 'WAIT':
        chat.clearUiActions()
        setSession((current) =>
          current ? { ...current, uiActions: [] } : current,
        )
        return
    }
  }

  async function handleQuizTypeSelected(kind: QuizKind) {
    const result = await runTurn('QUIZ_TYPE_SELECTED', { quizType: kind })
    if (!result) return
    setIsSelectingQuizType(false)
    if (result.activeQuizId) {
      autoOpenedQuizIdRef.current = result.activeQuizId
      setEmbeddedQuizReviewSummary(undefined)
      setLockedQuizId(result.activeQuizId)
      setEmbeddedQuizId(result.activeQuizId)
      setResourceReloadKey((key) => key + 1)
    }
  }

  async function refreshLearningProgress() {
    try {
      const nextSession = await sessionsRepository.getById(activeSession.id)
      if (nextSession) {
        setSession((current) => ({
          ...nextSession,
          materialTitle: current?.materialTitle ?? nextSession.materialTitle,
          totalPages: current?.totalPages ?? nextSession.totalPages,
        }))
        setCurrentPage(nextSession.currentPage)
      }
      setResourceReloadKey((key) => key + 1)
      setError(null)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    }
  }

  function handleOpenQuizHistory(quizId: string) {
    const summary = sessionQuizzes.find((quiz) => quiz.quizId === quizId)
    setEmbeddedQuizReviewSummary(summary?.submitted ? summary : undefined)
    if (!summary?.submitted) setLockedQuizId(quizId)
    setEmbeddedQuizId(quizId)
  }

  const availableUiActions = chat.streamUiActions.length > 0
    ? chat.streamUiActions
    : (activeSession.uiActions ?? [])
  const hasConversationAction = isSelectingQuizType
    || availableUiActions.length > 0
    || Boolean(activeSession.activeQuizId && !embeddedQuizId)
    || Boolean(error)

  function resizeChatPanel(clientX: number) {
    const workspace = workspaceRef.current
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const nextMaximum = Math.max(
      MIN_CHAT_PANEL_WIDTH,
      bounds.width - MIN_PDF_PANEL_WIDTH - PANEL_RESIZER_WIDTH,
    )
    const nextWidth = bounds.right - clientX - PANEL_RESIZER_WIDTH / 2
    setChatPanelMaxWidth(nextMaximum)
    setChatPanelWidth(Math.min(nextMaximum, Math.max(MIN_CHAT_PANEL_WIDTH, nextWidth)))
  }

  function handleResizerPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeChatPanel(event.clientX)
  }

  function handleResizerPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizeChatPanel(event.clientX)
  }

  function handleResizerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? 24 : -24
    setChatPanelWidth((width) => {
      const currentWidth = width ?? Math.max(
        MIN_CHAT_PANEL_WIDTH,
        ((workspaceRef.current?.clientWidth || DEFAULT_CHAT_PANEL_WIDTH * 2) - PANEL_RESIZER_WIDTH) / 2,
      )
      return Math.min(
        chatPanelMaxWidth,
        Math.max(MIN_CHAT_PANEL_WIDTH, currentWidth + delta),
      )
    })
  }

  return (
    <div className="h-full min-h-0">
      <h1 className="sr-only">학습 공간</h1>
      <p className="sr-only">
        {activeSession.materialTitle} 학습 화면입니다.
      </p>

      <section className="flex h-full min-h-0 mobile-phone:flex-col">
        {isResourcePanelOpen ? (
          <SessionResourcePanel
            activeMaterialId={activeSession.materialId}
            isPending={isActionPending || chat.isTurnPending}
            onClose={() => setIsResourcePanelOpen(false)}
            resourcePath={(material) =>
              material.sessionId
                ? sessionDetailPath(material.sessionId)
                : materialViewerPath(material.id)
            }
            weeks={resourceWeeks}
          />
        ) : null}

        {isPhone ? (
          <MobileWorkspaceTabs
            active={mobilePane}
            items={[{ label: embeddedQuizId ? '퀴즈' : '자료', value: 'content' }, { label: '학습', value: 'learning' }]}
            onChange={setMobilePane}
          />
        ) : null}

        <div
          className="study-session-content h-full min-h-0 min-w-0 flex-1"
          ref={workspaceRef}
          style={chatPanelWidth === null
            ? undefined
            : { '--chat-panel-width': `${chatPanelWidth}px` } as CSSProperties}
        >
          <div className={isPhone && mobilePane !== 'content' ? 'hidden' : 'min-h-0 min-w-0 overflow-hidden'}>
          <Suspense
            fallback={
              <div
                className="flex h-full min-h-0 items-center justify-center border-r border-stone-200 bg-white type-body text-stone-500"
                role="status"
              >
                PDF 뷰어를 준비하고 있습니다.
              </div>
            }
          >
            {embeddedQuizId ? (
              <QuizWorkspace
                embedded
                materialId={activeSession.materialId}
                onBackToPdf={() => {
                  setEmbeddedQuizId(null)
                  setEmbeddedQuizReviewSummary(undefined)
                }}
                onSubmitted={(result) => {
                  const quizSummary = sessionQuizzes.find((item) => item.quizId === embeddedQuizId)
                  setEmbeddedQuizReviewSummary({
                    maxScore: result.maxScore,
                    passed: result.passed,
                    quizId: embeddedQuizId,
                    quizType: quizSummary?.quizType ?? 'QUIZ',
                    score: result.score,
                    submitted: true,
                    title: quizSummary?.title ?? '학습 확인 퀴즈',
                  })
                  setLockedQuizId(null)
                  void refreshLearningProgress()
                }}
                quizId={embeddedQuizId}
                reviewSummary={embeddedQuizReviewSummary}
                showReviewChat={false}
              />
            ) : (
              <SessionPageViewer
                backTo={weekPagePath}
                currentPage={currentPage}
                file={materialFile}
                fileError={materialFileError}
                isPending={isActionPending || chat.isTurnPending}
                materialTitle={activeSession.materialTitle}
                onMovePage={handlePageNavigation}
                onOpenResources={isResourcePanelOpen
                  ? undefined
                  : () => setIsResourcePanelOpen(true)}
                totalPages={totalPages}
              />
            )}
          </Suspense>
          </div>

          <div
            aria-label="PDF와 학습 패널 너비 조절"
            aria-orientation="vertical"
            aria-valuemax={Math.round(chatPanelMaxWidth)}
            aria-valuemin={MIN_CHAT_PANEL_WIDTH}
            aria-valuenow={chatPanelWidth === null ? undefined : Math.round(chatPanelWidth)}
            className="group hidden h-full cursor-col-resize touch-none items-center justify-center bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-600 lg:flex mobile-web:!hidden"
            onDoubleClick={() => setChatPanelWidth(null)}
            onKeyDown={handleResizerKeyDown}
            onPointerDown={handleResizerPointerDown}
            onPointerMove={handleResizerPointerMove}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            role="separator"
            tabIndex={0}
            title="드래그하여 PDF와 학습 패널 너비 조절, 두 번 클릭하여 동일 너비로 복원"
          >
            <span className="h-full w-px bg-stone-200 transition-colors group-hover:bg-brand-400" />
          </div>

          <div className={isPhone && mobilePane !== 'learning' ? 'hidden' : 'min-h-0 min-w-0 overflow-hidden'}>
          {lockedQuizId ? (
            <QuizChatLockPanel
              isQuizVisible={embeddedQuizId === lockedQuizId}
              onResume={() => {
                setEmbeddedQuizReviewSummary(undefined)
                setEmbeddedQuizId(lockedQuizId)
              }}
            />
          ) : embeddedQuizId && embeddedQuizReviewSummary?.submitted && activeSession.materialId ? (
            <DocumentChatPanel
              className="!min-h-0 !rounded-none !border-0"
              key={`${activeSession.materialId}-quiz`}
              materialId={activeSession.materialId}
              mode="quiz"
              request={apiRequest}
            />
          ) : <ChatPanel
            request={apiRequest}
            chat={chat}
            className="!rounded-none !border-0"
            textSizeOwnerId={user?.id ?? user?.email}
            materialOverview={materialOverview}
            conversationAction={hasConversationAction ? (
              <div className="grid gap-2">
                {isSelectingQuizType ? (
                  <div>
                    <p className="type-chat-body font-semibold text-stone-900">
                      어떤 유형의 퀴즈를 풀까요?
                    </p>
                    <p className="mt-1 type-caption text-stone-500">
                      (응시 중에는 학습 내용을 볼 수 없습니다.)
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {QUIZ_TYPE_OPTIONS.map((option) => (
                        <Button
                          disabled={isActionPending || chat.isTurnPending}
                          key={option.kind}
                          onClick={() => void handleQuizTypeSelected(option.kind)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <UiActionsRenderer
                    actions={availableUiActions}
                    disabled={isActionPending || chat.isTurnPending}
                    onEvent={(event, selection) => void handleEvent(event, selection)}
                    onOpenDiagnosis={(diagnosisId) =>
                      navigate(diagnosisPath(activeSession.id, diagnosisId))
                    }
                  />
                )}

                {activeSession.activeQuizId && !isSelectingQuizType && !embeddedQuizId ? (
                  <Button
                    onClick={() => {
                      setEmbeddedQuizReviewSummary(undefined)
                      setEmbeddedQuizId(activeSession.activeQuizId ?? null)
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    진행 중인 퀴즈 풀기
                  </Button>
                ) : null}

                {error ? (
                  <p className="type-caption font-medium text-rose-700" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : undefined}
            currentPage={currentPage}
            onExplainCurrentPage={() => handleEvent('EXPLAIN_CURRENT_PAGE')}
            onExplainNextPage={handleExplainNextPage}
            onOpenQuiz={handleOpenQuizHistory}
            onOverviewPageSelect={(pageNumber) => void handlePageNavigation(pageNumber)}
            onRequestQuiz={() => setIsSelectingQuizType(true)}
            onReloadQuizzes={() => setResourceReloadKey((key) => key + 1)}
            onTurnCompleted={applyTurnResult}
            quizzes={sessionQuizzes}
            quizzesError={sessionQuizzesError}
            isLoadingQuizzes={isLoadingSessionQuizzes}
            sessionId={activeSession.id}
          />}
          </div>
        </div>
      </section>
    </div>
  )
}

function QuizChatLockPanel({
  isQuizVisible,
  onResume,
}: {
  isQuizVisible: boolean
  onResume: () => void
}) {
  return (
    <section
      aria-label="퀴즈 응시 중 채팅 잠금"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-stone-200 bg-white"
    >
      <div className="flex h-13 shrink-0 items-center border-b border-stone-200 px-4">
        <h2 className="type-control font-semibold text-stone-700">학습</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <LockKeyhole aria-hidden="true" size={20} />
        </span>
        <h3 className="mt-4 type-section-title font-bold text-stone-950">퀴즈 응시 중</h3>
        <p className="mt-2 max-w-xs type-body leading-6 text-stone-500">
          공정한 학습 확인을 위해 제출 전에는 학습 내용을 볼 수 없습니다.
        </p>
        <p className="mt-1 type-caption text-stone-400">
          퀴즈를 제출하면 대화 내용과 입력창이 다시 표시됩니다.
        </p>
        {!isQuizVisible ? (
          <Button className="mt-5" onClick={onResume} type="button" variant="secondary">
            퀴즈 계속 풀기
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function createExplainPagePrompt(): UiAction {
  return {
    kind: 'BINARY_DECISION',
    label: '현재 페이지를 설명할까요?',
    noEvent: 'WAIT',
    yesEvent: 'EXPLAIN_CURRENT_PAGE',
  }
}

function createNextPageConfirmation(): UiAction {
  return {
    kind: 'BINARY_DECISION',
    label: '다음 페이지로 이동할까요?',
    noEvent: 'WAIT',
    yesEvent: 'MOVE_NEXT_PAGE',
  }
}

function withPagePromptFallback<T extends LearningSession>(session: T): T {
  if (session.uiActions?.length || session.pageStatus !== 'NOT_EXPLAINED') return session
  return { ...session, uiActions: [createExplainPagePrompt()] }
}

function normalizeProgressActions(actions: UiAction[]): UiAction[] {
  return actions.map((action) => action.kind === 'MOVE_NEXT_PAGE'
    ? createNextPageConfirmation()
    : action)
}

function isQuizProposal(action: UiAction): boolean {
  return action.kind === 'BINARY_DECISION'
    && (action.yesEvent === 'SHOW_QUIZ_TYPE_SELECT' || action.label.includes('퀴즈'))
}

function createTurnRequestId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `turn-${Date.now()}`
}

function isTurnInProgressError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
    && error.status === 409
    && error.code === 'TURN_IN_PROGRESS'
}

type ClassroomsRepository = ReturnType<typeof createClassroomsRepository>

async function findClassroomContext(
  repository: ClassroomsRepository,
  materialId: string,
  preferredClassroomId: string | null,
  signal: AbortSignal,
): Promise<{ classroom: Classroom; classroomId: string; weeks: ClassroomWeek[] } | null> {
  if (preferredClassroomId) {
    try {
      const [classroom, weeks] = await Promise.all([
        repository.get(preferredClassroomId, signal),
        repository.listWeeks(preferredClassroomId, signal),
      ])
      if (weeksContainMaterial(weeks, materialId)) {
        return { classroom, classroomId: preferredClassroomId, weeks }
      }
    } catch {
      if (signal.aborted) return null
    }
  }

  const classrooms = await repository.list('', signal)
  for (const classroom of classrooms) {
    if (classroom.id === preferredClassroomId) continue
    try {
      const weeks = await repository.listWeeks(classroom.id, signal)
      if (weeksContainMaterial(weeks, materialId)) {
        return { classroom, classroomId: classroom.id, weeks }
      }
    } catch {
      if (signal.aborted) return null
    }
  }
  return null
}

function weeksContainMaterial(weeks: ClassroomWeek[], materialId: string): boolean {
  return weeks.some((week) =>
    week.materials.some((material) => material.id === materialId),
  )
}

function selectSessionsByMaterial(
  sessions: Array<Pick<LearningSession, 'id' | 'materialId'>>,
): Map<string, Pick<LearningSession, 'id' | 'materialId'>> {
  const selected = new Map<string, Pick<LearningSession, 'id' | 'materialId'>>()
  sessions.forEach((item) => {
    if (item.materialId && !selected.has(item.materialId)) {
      selected.set(item.materialId, item)
    }
  })
  return selected
}
