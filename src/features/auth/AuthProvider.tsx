import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import {
  apiRequest as requestApi,
  ApiClientError,
  rawApiRequest as requestRawApi,
} from '../../shared/api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthUser,
  type LogoutReason,
} from './authContext'
import {
  AuthRefreshCoordinator,
  type AuthCoordinatorMessage,
  type AuthCoordinatorSnapshot,
} from './AuthRefreshCoordinator'
import {
  getAuthRepository,
  type AccessGrant,
  type AuthSessionPolicy,
} from './authRepository'
import type {
  GoogleAuthValues,
  LoginFormValues,
  SignupFormValues,
} from './authValidation'

interface AuthProviderProps {
  initialUser?: AuthUser | null
}

export const AUTH_IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const AUTH_IDLE_WARNING_MS = 28 * 60 * 1000
export const AUTH_RESTORE_TIMEOUT_MS = 5_000
export const AUTH_REFRESH_TIMEOUT_MS = 10_000
export const AUTH_REFRESH_EARLY_MS = 5 * 60 * 1000
export const AUTH_ACTIVITY_RECORD_INTERVAL_MS = 5 * 60 * 1000
const AUTH_ACTIVITY_BROADCAST_THROTTLE_MS = 2_000
const EXAM_IDLE_WARNING_LEAD_MS = 2 * 60 * 1000
const IDLE_CHECK_INTERVAL_MS = 30_000

interface AuthSession extends AccessGrant {
  accessExpiresAt: number
  grantReceivedAt: number
  user: AuthUser
}

interface PendingGrant {
  grant: AccessGrant
  receivedAt: number
  revision: number
}

const TERMINAL_AUTH_CODES = new Set([
  'AUTH_SESSION_ABSOLUTE_EXPIRED',
  'AUTH_SESSION_IDLE_EXPIRED',
  'TOKEN_INVALID',
  'USER_INACTIVE',
])

export function AuthProvider({
  children,
  initialUser,
}: PropsWithChildren<AuthProviderProps>) {
  const hasExplicitInitialUser = initialUser !== undefined
  const [initialReceivedAt] = useState(() => Date.now())
  const [session, setSession] = useState<AuthSession | null>(() =>
    initialUser
      ? createSession(
          createTestGrant(initialReceivedAt),
          initialUser,
          initialReceivedAt,
        )
      : null,
  )
  const [isInitializing, setIsInitializing] = useState(!hasExplicitInitialUser)
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null)
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false)
  const [authRecoveryError, setAuthRecoveryError] = useState<string | null>(null)
  const [pendingGoogleIdToken, setPendingGoogleIdToken] = useState<string | null>(
    null,
  )
  const sessionRef = useRef(session)
  const sessionRevisionRef = useRef(0)
  const lastActivityAtRef = useRef(initialUser ? initialReceivedAt : 0)
  const lastServerActivityAtRef = useRef(initialUser ? initialReceivedAt : 0)
  const lastActivityBroadcastAtRef = useRef(0)
  const examInProgressRef = useRef(false)
  const activityPromiseRef = useRef<Promise<void> | null>(null)
  const pendingGrantRef = useRef<PendingGrant | null>(null)
  const coordinatorRef = useRef<AuthRefreshCoordinator | null>(null)
  const repository = getAuthRepository()

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const getCoordinatorSnapshot = useCallback((): AuthCoordinatorSnapshot => {
    const current = sessionRef.current
    const pending = pendingGrantRef.current
    return {
      grant: current ? toAccessGrant(current) : (pending?.grant ?? null),
      grantReceivedAt: current?.grantReceivedAt ?? pending?.receivedAt ?? 0,
      revision: sessionRevisionRef.current,
      userId: current?.user.id,
    }
  }, [])

  const applyGrant = useCallback(
    (grant: AccessGrant, revision: number, receivedAt: number) => {
      sessionRevisionRef.current = Math.max(
        sessionRevisionRef.current,
        revision,
      )
      lastServerActivityAtRef.current = receivedAt
      setAuthRecoveryError(null)

      const current = sessionRef.current
      if (!current) {
        pendingGrantRef.current = { grant, receivedAt, revision }
        return
      }

      const nextSession = createSession(grant, current.user, receivedAt)
      sessionRef.current = nextSession
      setSession(nextSession)
    },
    [],
  )

  const clearSession = useCallback(
    (reason: LogoutReason, broadcast = true) => {
      const currentUserId = sessionRef.current?.user.id
      const revision = sessionRevisionRef.current + 1
      sessionRevisionRef.current = revision
      sessionRef.current = null
      pendingGrantRef.current = null
      activityPromiseRef.current = null
      setSession(null)
      setLogoutReason(reason)
      setIsIdleWarningOpen(false)
      setAuthRecoveryError(null)

      if (broadcast) {
        coordinatorRef.current?.publish({
          reason,
          revision,
          type: 'SESSION_ENDED',
          userId: currentUserId,
        })
      }
    },
    [],
  )

  const updateSessionPolicy = useCallback(
    (
      policy: AuthSessionPolicy,
      revision: number,
      recordedAt: number,
    ) => {
      const current = sessionRef.current
      sessionRevisionRef.current = Math.max(
        sessionRevisionRef.current,
        revision,
      )
      lastServerActivityAtRef.current = Math.max(
        lastServerActivityAtRef.current,
        recordedAt,
      )
      if (!current) return

      const nextSession = { ...current, session: policy }
      sessionRef.current = nextSession
      setSession(nextSession)
    },
    [],
  )

  const handleCoordinatorMessage = useCallback(
    (message: AuthCoordinatorMessage) => {
      const current = sessionRef.current
      if (
        current?.user.id !== undefined &&
        message.userId !== undefined &&
        current.user.id !== message.userId
      ) {
        return
      }

      if (message.type === 'ACTIVITY') {
        lastActivityAtRef.current = Math.max(
          lastActivityAtRef.current,
          message.occurredAt,
        )
        setIsIdleWarningOpen(false)
        if (message.session && message.recordedAt) {
          updateSessionPolicy(
            message.session,
            message.revision,
            message.recordedAt,
          )
        }
        return
      }

      if (message.type === 'REFRESH_SUCCEEDED') {
        const currentReceivedAt =
          sessionRef.current?.grantReceivedAt ??
          pendingGrantRef.current?.receivedAt ??
          0
        if (
          message.revision > sessionRevisionRef.current ||
          message.receivedAt > currentReceivedAt
        ) {
          applyGrant(message.grant, message.revision, message.receivedAt)
        }
        return
      }

      if (message.revision >= sessionRevisionRef.current) {
        sessionRevisionRef.current = message.revision
        clearSession(message.reason, false)
      }
    },
    [applyGrant, clearSession, updateSessionPolicy],
  )

  useEffect(() => {
    const coordinator = new AuthRefreshCoordinator({
      getSnapshot: getCoordinatorSnapshot,
      onMessage: handleCoordinatorMessage,
    })
    coordinatorRef.current = coordinator
    return () => {
      coordinator.dispose()
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null
    }
  }, [getCoordinatorSnapshot, handleCoordinatorMessage])

  const setExamInProgress = useCallback((isInProgress: boolean) => {
    examInProgressRef.current = isInProgress
    if (!isInProgress) setIsIdleWarningOpen(false)
  }, [])

  const renewAccessToken = useCallback(
    async (silentTerminal = false): Promise<AccessGrant | null> => {
      const performRefresh = async () => {
        const controller = new AbortController()
        const timeoutId = window.setTimeout(
          () => controller.abort(),
          AUTH_REFRESH_TIMEOUT_MS,
        )
        try {
          return await repository.refresh(controller.signal)
        } finally {
          window.clearTimeout(timeoutId)
        }
      }

      try {
        const coordinator = coordinatorRef.current
        const grant = coordinator
          ? await coordinator.refresh(performRefresh, applyGrant)
          : await performRefresh()

        if (!coordinator) {
          applyGrant(grant, sessionRevisionRef.current + 1, Date.now())
        }
        return grant
      } catch (error) {
        const terminalReason = getTerminalLogoutReason(error)
        if (terminalReason) {
          if (!silentTerminal || sessionRef.current) {
            clearSession(terminalReason)
          }
          return null
        }

        setAuthRecoveryError(
          '인증 연결이 일시적으로 불안정합니다. 작업 내용은 유지되며 다시 연결할 수 있습니다.',
        )
        throw error
      }
    },
    [applyGrant, clearSession, repository],
  )

  const beginSession = useCallback(
    (grant: AccessGrant, user: AuthUser, receivedAt = Date.now()) => {
      const pending = pendingGrantRef.current
      const usesPendingGrant = pending?.grant.accessToken === grant.accessToken
      const effectiveGrant = usesPendingGrant ? pending.grant : grant
      const effectiveReceivedAt = usesPendingGrant
        ? pending.receivedAt
        : receivedAt
      const revision = Math.max(
        sessionRevisionRef.current + 1,
        usesPendingGrant ? pending.revision : 0,
      )
      sessionRevisionRef.current = revision
      lastActivityAtRef.current = receivedAt
      lastServerActivityAtRef.current = effectiveReceivedAt
      pendingGrantRef.current = null
      const nextSession = createSession(
        effectiveGrant,
        user,
        effectiveReceivedAt,
      )
      sessionRef.current = nextSession
      setLogoutReason(null)
      setIsIdleWarningOpen(false)
      setAuthRecoveryError(null)
      setSession(nextSession)
      coordinatorRef.current?.publish({
        grant: effectiveGrant,
        receivedAt: effectiveReceivedAt,
        revision,
        type: 'REFRESH_SUCCEEDED',
        userId: user.id,
      })
    },
    [],
  )

  useEffect(() => {
    if (hasExplicitInitialUser) return

    const controller = new AbortController()
    let isActive = true
    const timeoutId = window.setTimeout(() => {
      controller.abort()
      if (isActive) setIsInitializing(false)
    }, AUTH_RESTORE_TIMEOUT_MS)

    void renewAccessToken(true)
      .then(async (grant) => {
        if (!grant) return
        const grantRevision = sessionRevisionRef.current
        const user = await repository.getMe(grant.accessToken, controller.signal)
        if (
          controller.signal.aborted ||
          grantRevision !== sessionRevisionRef.current
        ) {
          return
        }
        beginSession(grant, user)
      })
      .catch(() => {
        // 쿠키 없음·만료 또는 일시적 복구 실패는 비로그인 상태로 시작한다.
      })
      .finally(() => {
        window.clearTimeout(timeoutId)
        if (isActive) setIsInitializing(false)
      })

    return () => {
      isActive = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [beginSession, hasExplicitInitialUser, renewAccessToken, repository])

  const recordSessionActivity = useCallback(
    (occurredAt: number): Promise<void> => {
      if (activityPromiseRef.current) return activityPromiseRef.current

      activityPromiseRef.current = (async () => {
        if (
          hasExplicitInitialUser ||
          !sessionRef.current ||
          document.visibilityState !== 'visible'
        ) {
          return
        }

        const current = sessionRef.current
        if (!current) return

        if (current.accessExpiresAt - Date.now() <= AUTH_REFRESH_EARLY_MS) {
          await renewAccessToken()
          return
        }

        if (
          Date.now() - lastServerActivityAtRef.current <
          AUTH_ACTIVITY_RECORD_INTERVAL_MS
        ) {
          return
        }

        const task = async () => {
          if (
            Date.now() - lastServerActivityAtRef.current <
            AUTH_ACTIVITY_RECORD_INTERVAL_MS
          ) {
            return
          }
          const activeSession = sessionRef.current
          if (!activeSession) return

          const controller = new AbortController()
          const timeoutId = window.setTimeout(
            () => controller.abort(),
            AUTH_REFRESH_TIMEOUT_MS,
          )
          let policy: AuthSessionPolicy
          try {
            policy = await repository.recordSessionActivity(
              activeSession.accessToken,
              controller.signal,
            )
          } finally {
            window.clearTimeout(timeoutId)
          }
          const recordedAt = Date.now()
          const revision = sessionRevisionRef.current + 1
          updateSessionPolicy(policy, revision, recordedAt)
          coordinatorRef.current?.publish({
            occurredAt,
            recordedAt,
            revision,
            session: policy,
            type: 'ACTIVITY',
            userId: activeSession.user.id,
          })
        }

        if (coordinatorRef.current) {
          await coordinatorRef.current.runExclusive(task)
        } else {
          await task()
        }
      })()
        .catch((error: unknown) => {
          const terminalReason = getTerminalLogoutReason(error)
          if (terminalReason) {
            clearSession(terminalReason)
            return
          }
          setAuthRecoveryError(
            '세션 활동 기록을 잠시 완료하지 못했습니다. 다음 활동에서 다시 시도합니다.',
          )
        })
        .finally(() => {
          activityPromiseRef.current = null
        })

      return activityPromiseRef.current
    },
    [
      clearSession,
      hasExplicitInitialUser,
      renewAccessToken,
      repository,
      updateSessionPolicy,
    ],
  )

  const noteUserActivity = useCallback(() => {
    const now = Date.now()
    lastActivityAtRef.current = now
    setIsIdleWarningOpen(false)

    if (
      now - lastActivityBroadcastAtRef.current >=
      AUTH_ACTIVITY_BROADCAST_THROTTLE_MS
    ) {
      lastActivityBroadcastAtRef.current = now
      coordinatorRef.current?.publish({
        occurredAt: now,
        revision: sessionRevisionRef.current,
        type: 'ACTIVITY',
        userId: sessionRef.current?.user.id,
      })
    }

    void recordSessionActivity(now)
  }, [recordSessionActivity])

  useEffect(() => {
    if (!session || hasExplicitInitialUser) return

    const checkIdle = () => {
      const current = sessionRef.current
      if (!current) return
      const now = Date.now()
      const absoluteExpiresAt = Date.parse(current.session.absoluteExpiresAt)
      if (Number.isFinite(absoluteExpiresAt) && now >= absoluteExpiresAt) {
        clearSession('absolute-expired')
        return
      }

      const idleTimeoutMs = current.session.idleTimeoutSeconds * 1000
      const elapsedMs = now - lastActivityAtRef.current
      if (elapsedMs >= idleTimeoutMs) {
        if (document.visibilityState === 'visible') {
          void repository.logout().catch(() => undefined)
          clearSession('idle')
        }
        return
      }

      if (
        examInProgressRef.current &&
        elapsedMs >= Math.max(0, idleTimeoutMs - EXAM_IDLE_WARNING_LEAD_MS)
      ) {
        setIsIdleWarningOpen(true)
      }
    }

    const checkVisibility = () => {
      if (document.visibilityState === 'visible') checkIdle()
    }
    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ]
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, noteUserActivity, { passive: true }),
    )
    document.addEventListener('visibilitychange', checkVisibility)
    const intervalId = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS)

    return () => {
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, noteUserActivity),
      )
      document.removeEventListener('visibilitychange', checkVisibility)
      window.clearInterval(intervalId)
    }
  }, [
    clearSession,
    hasExplicitInitialUser,
    noteUserActivity,
    repository,
    session,
  ])

  useEffect(() => {
    if (!session || hasExplicitInitialUser) return
    const absoluteExpiresAt = Date.parse(session.session.absoluteExpiresAt)
    if (
      Number.isFinite(absoluteExpiresAt) &&
      session.accessExpiresAt >= absoluteExpiresAt
    ) {
      return
    }

    const delay = Math.max(
      0,
      session.accessExpiresAt - AUTH_REFRESH_EARLY_MS - Date.now(),
    )
    const timeoutId = window.setTimeout(() => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastActivityAtRef.current <= AUTH_REFRESH_EARLY_MS
      ) {
        void renewAccessToken().catch(() => undefined)
      }
    }, delay)
    return () => window.clearTimeout(timeoutId)
  }, [hasExplicitInitialUser, renewAccessToken, session])

  const login = useCallback(
    async (values: LoginFormValues) => {
      const result = await repository.login(values)
      beginSession(result, result.user)
      return result.user
    },
    [beginSession, repository],
  )

  const loginWithGoogle = useCallback(
    async (values: GoogleAuthValues) => {
      const result = await repository.loginWithGoogle(values)
      setPendingGoogleIdToken(null)
      beginSession(result, result.user)
      return result.user
    },
    [beginSession, repository],
  )

  const prepareGoogleSignup = useCallback((idToken: string) => {
    setPendingGoogleIdToken(idToken)
  }, [])

  const clearGoogleSignup = useCallback(() => {
    setPendingGoogleIdToken(null)
  }, [])

  const checkEmailAvailability = useCallback(
    (email: string, signal?: AbortSignal) =>
      repository.checkEmailAvailability(email, signal),
    [repository],
  )

  const signup = useCallback(
    async (values: SignupFormValues) => {
      await repository.signup(values)
      const result = await repository.login(values)
      beginSession(result, result.user)
    },
    [beginSession, repository],
  )

  const logout = useCallback(async () => {
    const task = () => repository.logout().catch(() => undefined)
    if (coordinatorRef.current) {
      await coordinatorRef.current.runExclusive(task)
    } else {
      await task()
    }
    clearSession('manual')
  }, [clearSession, repository])

  const updateUser = useCallback((user: AuthUser) => {
    const current = sessionRef.current
    if (!current) return
    const nextSession = { ...current, user: { ...current.user, ...user } }
    sessionRef.current = nextSession
    setSession(nextSession)
  }, [])

  const authenticatedRequest = useCallback<AuthContextValue['apiRequest']>(
    async (path, options = {}) => {
      const accessToken = sessionRef.current?.accessToken
      if (!accessToken) {
        clearSession('session-expired')
        throw createAuthRequiredError()
      }

      try {
        return await requestApi(path, { ...options, accessToken })
      } catch (error) {
        const directReason = getTerminalLogoutReason(error)
        if (directReason) {
          clearSession(directReason)
          throw error
        }
        if (!isRefreshableUnauthorized(error) || hasExplicitInitialUser) {
          throw error
        }

        const grant = await renewAccessToken()
        if (!grant) throw error
        try {
          return await requestApi(path, {
            ...options,
            accessToken: grant.accessToken,
          })
        } catch (retryError) {
          if (isUnauthorizedOrInactive(retryError)) {
            clearSession(
              getTerminalLogoutReason(retryError) ?? 'session-expired',
            )
          }
          throw retryError
        }
      }
    },
    [clearSession, hasExplicitInitialUser, renewAccessToken],
  )

  const authenticatedRawRequest = useCallback<
    AuthContextValue['rawApiRequest']
  >(
    async (path, options = {}) => {
      const accessToken = sessionRef.current?.accessToken
      if (!accessToken) {
        clearSession('session-expired')
        throw createAuthRequiredError()
      }

      try {
        return await requestRawApi(path, { ...options, accessToken })
      } catch (error) {
        const directReason = getTerminalLogoutReason(error)
        if (directReason) {
          clearSession(directReason)
          throw error
        }
        if (!isRefreshableUnauthorized(error) || hasExplicitInitialUser) {
          throw error
        }

        const grant = await renewAccessToken()
        if (!grant) throw error
        try {
          return await requestRawApi(path, {
            ...options,
            accessToken: grant.accessToken,
          })
        } catch (retryError) {
          if (isUnauthorizedOrInactive(retryError)) {
            clearSession(
              getTerminalLogoutReason(retryError) ?? 'session-expired',
            )
          }
          throw retryError
        }
      }
    },
    [clearSession, hasExplicitInitialUser, renewAccessToken],
  )

  const withdraw = useCallback(
    async (password: string) => {
      await authenticatedRequest('/api/users/me', {
        body: { password },
        method: 'DELETE',
      })
      clearSession('manual')
    },
    [authenticatedRequest, clearSession],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      apiRequest: authenticatedRequest,
      rawApiRequest: authenticatedRawRequest,
      checkEmailAvailability,
      clearGoogleSignup,
      isAuthenticated: session !== null,
      isInitializing,
      login,
      loginWithGoogle,
      logoutReason,
      logout,
      pendingGoogleIdToken,
      prepareGoogleSignup,
      setExamInProgress,
      signup,
      user: session?.user ?? null,
      updateUser,
      withdraw,
    }),
    [
      authenticatedRequest,
      authenticatedRawRequest,
      checkEmailAvailability,
      clearGoogleSignup,
      isInitializing,
      login,
      loginWithGoogle,
      logout,
      logoutReason,
      pendingGoogleIdToken,
      prepareGoogleSignup,
      setExamInProgress,
      session,
      signup,
      updateUser,
      withdraw,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authRecoveryError && session ? (
        <div
          className="fixed right-4 bottom-4 z-[110] flex max-w-sm items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg"
          role="alert"
        >
          <p className="type-caption font-medium text-amber-950">
            {authRecoveryError}
          </p>
          <button
            className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-2 type-control font-semibold text-amber-950 hover:bg-amber-100"
            onClick={() => void renewAccessToken().catch(() => undefined)}
            type="button"
          >
            다시 연결
          </button>
        </div>
      ) : null}
      {isIdleWarningOpen ? (
        <div
          aria-labelledby="exam-idle-warning-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/45 px-4"
          role="dialog"
        >
          <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-2xl">
            <h2
              className="type-dialog-title font-bold text-stone-950"
              id="exam-idle-warning-title"
            >
              계속 응시 중이신가요?
            </h2>
            <p className="mt-2 type-body text-stone-600">
              2분 안에 응답하지 않으면 보안을 위해 로그아웃됩니다. 작성한
              답안은 이 기기에 임시 저장됩니다.
            </p>
            <button
              className="mt-6 flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-700 px-4 type-control font-semibold text-white hover:bg-brand-800"
              onClick={noteUserActivity}
              type="button"
            >
              계속 응시
            </button>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  )
}

function createSession(
  grant: AccessGrant,
  user: AuthUser,
  receivedAt: number,
): AuthSession {
  return {
    ...grant,
    accessExpiresAt: receivedAt + grant.expiresIn * 1000,
    grantReceivedAt: receivedAt,
    user,
  }
}

function toAccessGrant(session: AuthSession): AccessGrant {
  return {
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    session: session.session,
  }
}

function createTestGrant(receivedAt: number): AccessGrant {
  return {
    accessToken: 'test-access-token',
    expiresIn: 60 * 60,
    session: {
      absoluteExpiresAt: new Date(
        receivedAt + 14 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      idleExpiresAt: new Date(
        receivedAt + AUTH_IDLE_TIMEOUT_MS,
      ).toISOString(),
      idleTimeoutSeconds: AUTH_IDLE_TIMEOUT_MS / 1000,
    },
  }
}

function createAuthRequiredError(): ApiClientError {
  return new ApiClientError({
    code: 'AUTH_REQUIRED',
    message: '로그인이 필요합니다.',
    status: 401,
  })
}

function getTerminalLogoutReason(error: unknown): LogoutReason | null {
  if (!(error instanceof ApiClientError)) return null
  if (!TERMINAL_AUTH_CODES.has(error.code)) return null
  if (error.code === 'AUTH_SESSION_IDLE_EXPIRED') return 'idle'
  if (error.code === 'AUTH_SESSION_ABSOLUTE_EXPIRED') {
    return 'absolute-expired'
  }
  if (error.code === 'USER_INACTIVE') return 'inactive'
  return 'session-expired'
}

function isRefreshableUnauthorized(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status === 401 &&
    !TERMINAL_AUTH_CODES.has(error.code)
  )
}

function isUnauthorizedOrInactive(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 ||
      (error.status === 403 && error.code === 'USER_INACTIVE'))
  )
}
