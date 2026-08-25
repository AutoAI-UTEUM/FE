import { useEffect } from 'react'

interface AsyncJobPollingOptions<T> {
  enabled: boolean
  fetchNext: (signal: AbortSignal) => Promise<T>
  getDelayMs?: (elapsedMs: number, value?: T) => number
  initialDelayMs?: number
  isPending: (value: T) => boolean
  maxDurationMs: number
  onDelayed?: () => void
  onError: (error: unknown) => void
  onResult: (value: T) => void
}

export function useAsyncJobPolling<T>({
  enabled,
  fetchNext,
  getDelayMs = () => 5000,
  initialDelayMs = 2000,
  isPending,
  maxDurationMs,
  onDelayed,
  onError,
  onResult,
}: AsyncJobPollingOptions<T>): void {
  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    const startedAt = Date.now()
    let timeoutId: number | undefined
    let stopped = false

    const schedule = (delayMs: number) => {
      timeoutId = window.setTimeout(poll, delayMs)
    }

    const poll = async () => {
      if (stopped) return
      if (document.visibilityState !== 'visible') {
        schedule(1000)
        return
      }

      const elapsedMs = Date.now() - startedAt
      if (elapsedMs >= maxDurationMs) {
        stopped = true
        onDelayed?.()
        return
      }

      try {
        const value = await fetchNext(controller.signal)
        if (stopped) return
        onResult(value)
        if (isPending(value)) schedule(getDelayMs(elapsedMs, value))
      } catch (error) {
        if (!controller.signal.aborted) onError(error)
      }
    }

    schedule(initialDelayMs)
    return () => {
      stopped = true
      controller.abort()
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [enabled, fetchNext, getDelayMs, initialDelayMs, isPending, maxDurationMs, onDelayed, onError, onResult])
}
