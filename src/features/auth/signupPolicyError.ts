import { ApiClientError } from '../../shared/api'

export const SIGNUP_POLICY_NOT_READY_MESSAGE = '가입 정책을 준비 중이어서 지금은 가입할 수 없습니다. 잠시 후 정책을 한 번 다시 확인한 뒤 직접 가입을 시도해 주세요.'
export function isSignupPolicyNotReady(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 503 && error.code === 'SIGNUP_POLICY_NOT_READY'
}
export function isPolicyConsentRequired(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 400 && error.code === 'POLICY_CONSENT_REQUIRED'
}
