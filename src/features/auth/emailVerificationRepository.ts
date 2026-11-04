import { apiRequest, ApiClientError } from '../../shared/api'
import type { AuthenticatedRequest } from './authContext'
import { isLaunchAuthReady, type EmailVerificationFields } from './launchAuthContract'

export interface EmailVerificationStatus extends EmailVerificationFields {
  emailVerification: 'UNKNOWN' | 'PENDING' | 'VERIFIED'
  emailVerificationRequired: boolean
  emailVerifiedAt: string | null
}

function assertReady() {
  if (!isLaunchAuthReady()) throw new ApiClientError({
    code: 'AUTH_CONTRACT_UNAVAILABLE', message: '이메일 확인 기능을 준비 중입니다.',
  })
}

export async function getEmailVerificationStatus(request: AuthenticatedRequest, signal?: AbortSignal) {
  assertReady()
  const { data } = await request<EmailVerificationStatus>('/api/auth/email-verification/status', {
    cache: 'no-store', signal,
  })
  if (!data || !['UNKNOWN', 'PENDING', 'VERIFIED'].includes(data.emailVerification) ||
      typeof data.emailVerificationRequired !== 'boolean' ||
      !(data.emailVerifiedAt === null || typeof data.emailVerifiedAt === 'string')) {
    throw new ApiClientError({ code: 'INVALID_RESPONSE', message: '이메일 확인 상태를 확인할 수 없습니다.' })
  }
  return data
}

export async function requestEmailVerification(request: AuthenticatedRequest, signal?: AbortSignal) {
  assertReady()
  await request<null>('/api/auth/email-verification/request', {
    method: 'POST', cache: 'no-store', signal,
  })
}

export async function confirmEmailVerification(token: string, signal?: AbortSignal) {
  assertReady()
  // Public token operation: never attach the currently logged-in account's grant/cookies.
  await apiRequest<EmailVerificationStatus>('/api/auth/email-verification/confirm', {
    body: { token }, method: 'POST', credentials: 'omit', cache: 'no-store',
    referrerPolicy: 'no-referrer', signal,
  })
  // The response belongs to the token account, which is intentionally unidentified.
}
