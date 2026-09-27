import { apiRequest } from '../../shared/api'
import type { AuthenticatedRequest } from './authContext'

export type PolicyType = 'PRIVACY' | 'TERMS'

/** 동의 요청·응답이 공통으로 쓰는 최소 식별자. */
export interface PolicyRef {
  type: PolicyType
  version: string
}

export interface PolicySummary extends PolicyRef {
  effectiveAt?: string
  requiresConsent: boolean
  summary?: string
  title: string
}

export interface PolicyDocument extends PolicySummary {
  content: string
}

export interface ConsentState {
  /** 과거 버전까지 포함한 전체 동의 이력. */
  agreed: Array<PolicyRef & { agreedAt: string }>
  /** 현재 유효 버전 중 아직 동의하지 않은 것. 비어 있으면 게이팅하지 않는다. */
  pending: Array<PolicyRef & { title?: string }>
}

/** 현재 공개 문서 중 서버가 명시적으로 동의를 요구한 버전만 가입 요청으로 정규화한다. */
export function getRequiredPolicyRefs(
  policies: PolicySummary[] | null | undefined,
): PolicyRef[] | null {
  if (!policies) return null

  const refs = new Map<PolicyType, PolicyRef>()
  for (const policy of policies.filter((item) => item.requiresConsent)) {
    if (!policy.version.trim() || refs.has(policy.type)) return null
    refs.set(policy.type, { type: policy.type, version: policy.version.trim() })
  }

  return (['TERMS', 'PRIVACY'] as const)
    .map((type) => refs.get(type))
    .filter((policy): policy is PolicyRef => Boolean(policy))
}

/** 전송 직전 최소 식별자만 남기고 중복·빈 버전을 거부한다. */
export function normalizePolicyRefs(
  policies: PolicyRef[] | null | undefined,
): PolicyRef[] | null {
  if (!policies?.length) return null

  const refs = new Map<PolicyType, PolicyRef>()
  for (const policy of policies) {
    if (!policy.version.trim() || refs.has(policy.type)) return null
    refs.set(policy.type, toRef({ ...policy, version: policy.version.trim() }))
  }
  return (['TERMS', 'PRIVACY'] as const)
    .map((type) => refs.get(type))
    .filter((policy): policy is PolicyRef => Boolean(policy))
}

/** 가입 화면은 로그인 전이라 인증 없는 공개 API를 쓴다. */
export async function getCurrentPolicies(
  signal?: AbortSignal,
): Promise<PolicySummary[]> {
  const { data } = await apiRequest<PolicySummary[]>('/api/policies/current', {
    signal,
  })
  return data
}

export async function getPolicyDocument(
  type: PolicyType,
  version: string,
  signal?: AbortSignal,
): Promise<PolicyDocument> {
  const { data } = await apiRequest<PolicyDocument>(
    `/api/policies/${encodeURIComponent(type)}/${encodeURIComponent(version)}`,
    { signal },
  )
  return data
}

export function createConsentsRepository(request: AuthenticatedRequest) {
  return {
    async list(signal?: AbortSignal): Promise<ConsentState> {
      const { data } = await request<ConsentState>('/api/users/me/consents', {
        signal,
      })
      return data
    },
    /** 서버가 현재 유효 버전만 받으므로 pendingConsents를 그대로 되돌려주면 된다. */
    async accept(consents: PolicyRef[], signal?: AbortSignal): Promise<ConsentState> {
      const { data } = await request<ConsentState>('/api/users/me/consents', {
        body: { consents: consents.map(toRef) },
        method: 'POST',
        signal,
      })
      return data
    },
  }
}

/** 가입·동의 요청에는 {type, version}만 보낸다. title 같은 여분 필드는 떼어낸다. */
export function toRef({ type, version }: PolicyRef): PolicyRef {
  return { type, version }
}
