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
  const [policyNotReady, setPolicyNotReady] = useState(false)
  const [retryUsed, setRetryUsed] = useState(false)
  const retryUsedRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    if (!enabled || controllerRef.current) return false
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setDocuments(null)
    setConsents([])
    setError('')
    try {
      const { data } = await apiRequest<PolicyDocument[]>('/api/policies/current', { signal: controller.signal, cache: 'no-store' })
      if (!Array.isArray(data) || data.some((item) =>
        !item || typeof item.type !== 'string' || typeof item.version !== 'string' ||
        typeof item.title !== 'string' || typeof item.requiresConsent !== 'boolean')) throw new Error('Invalid policy response')
      if (!controller.signal.aborted) { setDocuments(data); return true }
    } catch {
      if (!controller.signal.aborted) setError('현재 정책을 불러오지 못했습니다. 다시 시도해 주세요.')
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    return false
  }, [enabled])
  const markPolicyNotReady = () => { setPolicyNotReady(true); setConsents([]) }
  const retryPolicyLookup = async () => {
    if (!enabled || retryUsedRef.current || controllerRef.current) return
    retryUsedRef.current = true
    setRetryUsed(true)
    // An empty policy list is valid when BE requires no consent. Only signup
    // decides readiness; a successful lookup permits one explicit resubmission.
    if (await reload()) setPolicyNotReady(false)
  }
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void reload() })
    return () => { active = false; controllerRef.current?.abort() }
  }, [reload])
  const complete = !policyNotReady && (!enabled || (documents !== null && documents.every((item) =>
    !item.requiresConsent || consents.some((choice) => choice.type === item.type && choice.version === item.version))))
  return { enabled, documents, consents, setConsents, error, complete, reload, loading,
    policyNotReady, retryUsed, markPolicyNotReady, retryPolicyLookup }
}

