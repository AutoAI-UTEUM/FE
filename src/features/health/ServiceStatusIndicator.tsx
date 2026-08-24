import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cx } from '../../shared/lib/cx'
import {
  getServiceHealth,
  type ServiceHealth,
  type ServiceStatus,
} from './healthRepository'

const SERVICE_HEALTH_TIMEOUT_MS = 5_000

export function ServiceStatusIndicator() {
  const [health, setHealth] = useState<ServiceHealth | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const activeRequestRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    await Promise.resolve()

    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      SERVICE_HEALTH_TIMEOUT_MS,
    )

    setIsChecking(true)
    try {
      const nextHealth = await getServiceHealth(controller.signal)
      if (activeRequestRef.current === controller) setHealth(nextHealth)
    } catch {
      if (activeRequestRef.current === controller) {
        setHealth({
          checks: { aiService: 'DOWN', db: 'DOWN', main: 'DOWN' },
          status: 'DOWN',
        })
      }
    } finally {
      window.clearTimeout(timeoutId)
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null
        setIsChecking(false)
      }
    }
  }, [])

  useEffect(() => {
    const initialCheckId = window.setTimeout(() => void refresh(), 0)
    const intervalId = window.setInterval(() => void refresh(), 60_000)
    return () => {
      activeRequestRef.current?.abort()
      activeRequestRef.current = null
      window.clearTimeout(initialCheckId)
      window.clearInterval(intervalId)
    }
  }, [refresh])

  const status = health?.status ?? 'DOWN'
  const isServerOnline = health?.checks.main === 'UP'
  const label = isChecking && !health
    ? '서버 상태 확인 중'
    : isServerOnline
      ? '서버 온라인'
      : '서버 오프라인'
  const detail = health
    ? `Main ${health.checks.main} · DB ${health.checks.db} · AI ${health.checks.aiService}`
    : '서비스 상태를 확인하는 중입니다.'

  return (
    <button
      aria-label={label}
      className={cx(
        'flex h-8 items-center justify-center gap-2 rounded-lg px-2 type-caption text-stone-500 hover:bg-stone-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        isChecking && 'cursor-wait',
      )}
      disabled={isChecking}
      onClick={() => void refresh()}
      title={`${label} · ${detail}`}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cx(
          'size-2 shrink-0 rounded-full',
          isChecking ? 'animate-pulse bg-stone-400' : statusDotClasses[status],
        )}
      />
      <span>{label}</span>
      <RefreshCw
        aria-hidden="true"
        className={cx(
          'shrink-0 text-stone-400',
          isChecking && 'animate-spin',
        )}
        size={12}
      />
    </button>
  )
}

const statusDotClasses: Record<ServiceStatus, string> = {
  DEGRADED: 'bg-amber-500',
  DOWN: 'bg-rose-600',
  UP: 'bg-emerald-600',
}
