import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AuthRefreshCoordinator,
  type AuthCoordinatorMessage,
  type AuthCoordinatorSnapshot,
} from './AuthRefreshCoordinator'
import type { AccessGrant } from './authRepository'

const originalLocksDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  'locks',
)

afterEach(() => {
  if (originalLocksDescriptor) {
    Object.defineProperty(navigator, 'locks', originalLocksDescriptor)
  } else {
    Reflect.deleteProperty(navigator, 'locks')
  }
  FakeBroadcastChannel.channels.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AuthRefreshCoordinator', () => {
  it('uses one network refresh for concurrent requests in the same tab', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const state = createState()
    const coordinator = new AuthRefreshCoordinator({
      getSnapshot: () => state.snapshot,
      onMessage: () => undefined,
    })
    const performRefresh = vi.fn().mockResolvedValue(createGrant('token-1'))

    const [first, second] = await Promise.all([
      coordinator.refresh(performRefresh, state.applyGrant),
      coordinator.refresh(performRefresh, state.applyGrant),
    ])

    expect(performRefresh).toHaveBeenCalledTimes(1)
    expect(first.accessToken).toBe('token-1')
    expect(second.accessToken).toBe('token-1')
    coordinator.dispose()
  })

  it('reuses the broadcast result after waiting for the origin-wide lock', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new FakeLockManager(),
    })
    const firstState = createState(1)
    const secondState = createState(1)
    const first = createCoordinator(firstState)
    const second = createCoordinator(secondState)
    const performRefresh = vi.fn().mockResolvedValue(createGrant('shared-token'))

    const [firstGrant, secondGrant] = await Promise.all([
      first.refresh(performRefresh, firstState.applyGrant),
      second.refresh(performRefresh, secondState.applyGrant),
    ])

    expect(performRefresh).toHaveBeenCalledTimes(1)
    expect(firstGrant.accessToken).toBe('shared-token')
    expect(secondGrant.accessToken).toBe('shared-token')
    first.dispose()
    second.dispose()
  })
})

function createCoordinator(state: ReturnType<typeof createState>) {
  return new AuthRefreshCoordinator({
    getSnapshot: () => state.snapshot,
    onMessage: (message) => state.applyMessage(message),
  })
}

function createState(userId?: number) {
  let snapshot: AuthCoordinatorSnapshot = {
    grant: null,
    grantReceivedAt: 0,
    revision: 0,
    userId,
  }
  return {
    applyGrant: (grant: AccessGrant, revision: number, receivedAt: number) => {
      snapshot = { grant, grantReceivedAt: receivedAt, revision, userId }
    },
    applyMessage: (message: AuthCoordinatorMessage) => {
      if (message.type !== 'REFRESH_SUCCEEDED') return
      snapshot = {
        grant: message.grant,
        grantReceivedAt: message.receivedAt,
        revision: message.revision,
        userId,
      }
    },
    get snapshot() {
      return snapshot
    },
  }
}

function createGrant(accessToken: string): AccessGrant {
  return {
    accessToken,
    expiresIn: 900,
    session: {
      absoluteExpiresAt: '2026-10-04T04:00:00Z',
      idleExpiresAt: '2026-09-20T06:00:00Z',
      idleTimeoutSeconds: 7200,
    },
  }
}

class FakeLockManager {
  private tail = Promise.resolve()

  request<T>(_name: string, callback: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(callback)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>()
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null

  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set()
    channels.add(this)
    FakeBroadcastChannel.channels.set(name, channels)
  }

  close(): void {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this)
  }

  postMessage(data: unknown): void {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) {
        channel.onmessage?.({ data } as MessageEvent<unknown>)
      }
    }
  }
}
