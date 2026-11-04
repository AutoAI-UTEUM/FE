import { ApiClientError } from '../../shared/api'
import { isGuardianWorkflowReady } from './guardianContract'

export const PRIOR_CONSENT_CONTRACT = 'be-prior-consent-ebe09b86-v1'
export const isPriorConsentReady = () => isGuardianWorkflowReady() && import.meta.env.VITE_GUARDIAN_PRIOR_CONSENT_READINESS === PRIOR_CONSENT_CONTRACT
export function assertPriorConsentReady() {
  if (!isPriorConsentReady()) throw new ApiClientError({ code: 'GUARDIAN_TEAM_UNAVAILABLE', status: 503, message: '사전 동의 검토를 준비하고 있습니다.' })
}
export const priorMethods = ['IN_PERSON', 'EMAIL_REPLY', 'PHONE', 'SIGNED_DOCUMENT'] as const
export interface PriorConsentOptions {
  available: boolean; noticeVersion: string | null; noticeDigest: string | null; noticeUrl: string | null
  methods: typeof priorMethods[number][]; maxAge: string | null; requiredScopes: string[]; optionalAiScope: 'EXTERNAL_AI' | null
}
export function parsePriorConsentOptions(value: unknown): PriorConsentOptions {
  const bad = (): never => { throw new ApiClientError({ code: 'INVALID_RESPONSE', message: '사전 동의 옵션을 다시 확인하세요.' }) }
  if (!value || typeof value !== 'object') return bad()
  const v = value as PriorConsentOptions
  if (typeof v.available !== 'boolean' || !Array.isArray(v.methods) || !v.methods.every(m => priorMethods.includes(m)) || new Set(v.methods).size !== v.methods.length || !Array.isArray(v.requiredScopes)) return bad()
  if (!v.available) return { available: false, noticeVersion: null, noticeDigest: null, noticeUrl: null, methods: [], maxAge: null, requiredScopes: [], optionalAiScope: null }
  if (!v.noticeVersion?.trim() || !/^[a-fA-F0-9]{64}$/.test(v.noticeDigest ?? '') || !v.noticeUrl?.startsWith('https://') || !v.methods.length || !/^P(?=.*[1-9])[0-9.DTHMS]+$/.test(v.maxAge ?? '') || JSON.stringify(v.requiredScopes) !== '["SERVICE"]' || ![null, 'EXTERNAL_AI'].includes(v.optionalAiScope)) return bad()
  return v
}
