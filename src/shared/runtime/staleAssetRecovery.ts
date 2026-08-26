export const STALE_ASSET_RELOAD_KEY = 'uteum:stale-asset-reload-at'
export const STALE_ASSET_RELOAD_COOLDOWN_MS = 60_000

interface StaleAssetRecoveryOptions {
  now?: () => number
  reload?: () => void
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

export function registerStaleAssetRecovery({
  now = Date.now,
  reload = () => window.location.reload(),
  storage = window.sessionStorage,
}: StaleAssetRecoveryOptions = {}) {
  const handlePreloadError = (event: Event) => {
    const currentTime = now()
    let lastReloadAt = 0

    try {
      lastReloadAt = Number(storage.getItem(STALE_ASSET_RELOAD_KEY)) || 0
    } catch {
      // Storage can be unavailable in restrictive browser modes.
    }

    if (currentTime - lastReloadAt < STALE_ASSET_RELOAD_COOLDOWN_MS) {
      return
    }

    event.preventDefault()

    try {
      storage.setItem(STALE_ASSET_RELOAD_KEY, String(currentTime))
    } catch {
      // Reload still gives the browser one chance to fetch the current build.
    }

    reload()
  }

  window.addEventListener('vite:preloadError', handlePreloadError)

  return () => {
    window.removeEventListener('vite:preloadError', handlePreloadError)
  }
}
