import type { AccessGrant, AuthSessionPolicy } from './authRepository'
import type { LogoutReason } from './authContext'

export const AUTH_SESSION_LOCK_NAME = 'edupilot-auth-session-write'
export const AUTH_SESSION_CHANNEL_NAME = 'edupilot-auth-session'

export interface AuthCoordinatorSnapshot {
  grant: AccessGrant | null
  grantReceivedAt: number
  revision: number
  userId?: number
}

export type AuthCoordinatorMessage =
  | {
      occurredAt: number
      recordedAt?: number
      revision: number
      session?: AuthSessionPolicy
      type: 'ACTIVITY'
      userId?: number
    }
  | {
      grant: AccessGrant
      receivedAt: number
      revision: number
      type: 'REFRESH_SUCCEEDED'
      userId?: number
    }
  | {
      reason: LogoutReason
      revision: number
      type: 'SESSION_ENDED'
      userId?: number
    }

interface AuthRefreshCoordinatorOptions {
  getSnapshot: () => AuthCoordinatorSnapshot
  onMessage: (message: AuthCoordinatorMessage) => void
}

type NavigatorWithLocks = Navigator & {
  locks?: {
    request: <T>(
      name: string,
      callback: () => Promise<T> | T,
    ) => Promise<T>
  }
}

const FALLBACK_SETTLE_MS = 75

export class AuthRefreshCoordinator {
  private readonly channel: BroadcastChannel | null
  private refreshPromise: Promise<AccessGrant> | null = null

  constructor(private readonly options: AuthRefreshCoordinatorOptions) {
    this.channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(AUTH_SESSION_CHANNEL_NAME)

    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        if (isCoordinatorMessage(event.data)) {
          this.options.onMessage(event.data)
        }
      }
    }
  }

  dispose(): void {
    this.channel?.close()
  }

  publish(message: AuthCoordinatorMessage): void {
    this.channel?.postMessage(message)
  }

  refresh(
    performRefresh: () => Promise<AccessGrant>,
    applyGrant: (
      grant: AccessGrant,
      revision: number,
      receivedAt: number,
    ) => void,
  ): Promise<AccessGrant> {
    if (this.refreshPromise) return this.refreshPromise

    const started = this.options.getSnapshot()
    this.refreshPromise = this.runExclusive(async () => {
      if (this.channel) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
      const current = this.options.getSnapshot()
      if (
        current.grant &&
        (current.revision > started.revision ||
          current.grantReceivedAt > started.grantReceivedAt)
      ) {
        return current.grant
      }

      const grant = await performRefresh()
      const receivedAt = Date.now()
      const revision = Math.max(current.revision, started.revision) + 1
      applyGrant(grant, revision, receivedAt)
      this.publish({
        grant,
        receivedAt,
        revision,
        type: 'REFRESH_SUCCEEDED',
        userId: this.options.getSnapshot().userId,
      })
      return grant
    }).finally(() => {
      this.refreshPromise = null
    })

    return this.refreshPromise
  }

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const lockManager = (navigator as NavigatorWithLocks).locks
    if (lockManager?.request) {
      return lockManager.request(AUTH_SESSION_LOCK_NAME, task)
    }

    if (this.channel) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, FALLBACK_SETTLE_MS)
      })
    }
    return task()
  }
}

function isCoordinatorMessage(value: unknown): value is AuthCoordinatorMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type?: unknown }).type
  return (
    type === 'ACTIVITY' ||
    type === 'REFRESH_SUCCEEDED' ||
    type === 'SESSION_ENDED'
  )
}
