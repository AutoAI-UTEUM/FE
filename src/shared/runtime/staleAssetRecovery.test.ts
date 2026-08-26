import { describe, expect, it, vi } from 'vitest'

import {
  registerStaleAssetRecovery,
  STALE_ASSET_RELOAD_KEY,
} from './staleAssetRecovery'

function createStorage() {
  const values = new Map<string, string>()

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('registerStaleAssetRecovery', () => {
  it('reloads once when a deployed lazy-loaded asset is no longer available', () => {
    const reload = vi.fn()
    const storage = createStorage()
    const unregister = registerStaleAssetRecovery({
      now: () => 100_000,
      reload,
      storage,
    })
    const event = new Event('vite:preloadError', { cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(storage.getItem(STALE_ASSET_RELOAD_KEY)).toBe('100000')
    unregister()
  })

  it('lets the error boundary handle repeated failures instead of reloading forever', () => {
    const reload = vi.fn()
    const storage = createStorage()
    storage.setItem(STALE_ASSET_RELOAD_KEY, '99_000'.replace('_', ''))
    const unregister = registerStaleAssetRecovery({
      now: () => 100_000,
      reload,
      storage,
    })
    const event = new Event('vite:preloadError', { cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    unregister()
  })
})
