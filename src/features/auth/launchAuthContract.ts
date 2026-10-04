/** Preparation only. Never infer deployment readiness from an HTTP response. */
export const LAUNCH_AUTH_CONTRACT = 'be-auth-ee69e425-v1'

export function isLaunchAuthReady(): boolean {
  return import.meta.env.VITE_AUTH_CONTRACT_READINESS === LAUNCH_AUTH_CONTRACT
}

export interface EmailVerificationFields {
  emailVerification?: 'UNKNOWN' | 'PENDING' | 'VERIFIED'
  emailVerificationRequired?: boolean
  emailVerifiedAt?: string | null
}

export function hasEmailVerificationSupport(value: EmailVerificationFields): boolean {
  return value.emailVerification !== undefined &&
    typeof value.emailVerificationRequired === 'boolean'
}

export function requiresEmailVerification(value: EmailVerificationFields | null): boolean {
  return value?.emailVerificationRequired === true
}

export function isEmailVerificationError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && 'status' in error &&
    error.code === 'EMAIL_VERIFICATION_REQUIRED' && error.status === 403
}

/** Only routes/endpoints explicitly allowed before verification bypass the UI hold. */
export function isAccountManagementRequest(path: string): boolean {
  const pathname = path.split('?')[0]
  return /^\/api\/users\/me(?:\/(?:password|preferences|avatar|consents))?$/.test(pathname) ||
    /^\/api\/auth\/(?:email-verification|session|refresh|logout)(?:\/|$)/.test(pathname) ||
    /^\/api\/policies(?:\/|$)/.test(pathname)
}

export interface PolicyConsentChoice { type: string; version: string }

/** Validate a calendar date only; no age, future-date or guardian policy is invented. */
export function validateDateOfBirth(value?: string): string | undefined {
  if (!value) return '생년월일을 입력하세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return '생년월일을 YYYY-MM-DD 형식으로 입력하세요.'
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return '올바른 날짜를 입력하세요.'
  }
  return undefined
}
