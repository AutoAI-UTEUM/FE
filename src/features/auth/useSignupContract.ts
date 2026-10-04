import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../shared/api'
import { isLaunchAuthReady, type PolicyConsentChoice } from './launchAuthContract'

export interface PolicyDocument {
  type: string
  version: string
  title: string
  summary: string
  requiresConsent: boolean
}

export function useSignupContract() {
  const enabled = isLaunchAuthReady()
  const [documents, setDocuments] = useState<PolicyDocument[] | null>(null)
  const [consents, setConsents] = useState<PolicyConsentChoice[]>([])
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    if (!enabled) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setDocuments(null)
    setConsents([])
    setError('')
    try {
      const { data } = await apiRequest<PolicyDocument[]>('/api/policies/current', { signal: controller.signal, cache: 'no-store' })
      if (!Array.isArray(data) || data.some((item) =>
        !item || typeof item.type !== 'string' || typeof item.version !== 'string' ||
        typeof item.title !== 'string' || typeof item.requiresConsent !== 'boolean')) throw new Error('Invalid policy response')
      if (!controller.signal.aborted) setDocuments(data)
    } catch {
      if (!controller.signal.aborted) setError('현재 정책을 불러오지 못했습니다. 다시 시도해 주세요.')
    }
  }, [enabled])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void reload() })
    return () => { active = false; controllerRef.current?.abort() }
  }, [reload])
  const complete = !enabled || (documents !== null && documents.every((item) =>
    !item.requiresConsent || consents.some((choice) => choice.type === item.type && choice.version === item.version)))
  return { enabled, documents, consents, setConsents, error, complete, reload }
}

