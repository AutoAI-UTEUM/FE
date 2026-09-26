import { ApiClientError } from '../../shared/api'
import type {
  LoginFormErrors,
  SignupFormErrors,
} from './authValidation'

export class AuthValidationError extends Error {
  constructor(
    message: string,
    readonly formErrors: LoginFormErrors | SignupFormErrors,
  ) {
    super(message)
    this.name = 'AuthValidationError'
  }
}

export function mapAuthErrorToFormErrors(
  error: unknown,
): LoginFormErrors | SignupFormErrors | null {
  return error instanceof AuthValidationError ? error.formErrors : null
}

/**
 * 계정 정지·로그인 시도 제한은 특정 입력칸의 문제가 아니라서 폼 오류가 아닌 배너 문구로 알린다.
 * 해당하지 않는 오류는 null을 돌려주고 호출부의 기본 문구를 쓴다.
 */
export function getLoginErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null

  if (error.code === 'ACCOUNT_SUSPENDED') {
    return '계정이 정지되었습니다. 관리자에게 문의해 주세요.'
  }

  if (error.code === 'LOGIN_RATE_LIMITED') {
    return `로그인 시도가 너무 많습니다. ${formatRetryAfter(error.retryAfterSeconds)} 다시 시도해 주세요.`
  }

  return null
}

function formatRetryAfter(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '잠시 후'
  if (seconds < 60) return `${seconds}초 후`
  return `${Math.ceil(seconds / 60)}분 후`
}
