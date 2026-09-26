import { describe, expect, it } from 'vitest'

import { ApiClientError } from '../../shared/api'
import { getLoginErrorMessage } from './authErrors'

function loginError(code: string, retryAfterSeconds: number | null = null) {
  return new ApiClientError({ code, message: '서버 문구', retryAfterSeconds, status: 429 })
}

describe('getLoginErrorMessage', () => {
  it('안내한다: 계정 정지', () => {
    expect(getLoginErrorMessage(loginError('ACCOUNT_SUSPENDED'))).toBe(
      '계정이 정지되었습니다. 관리자에게 문의해 주세요.',
    )
  })

  it('Retry-After를 분으로 올려 안내한다', () => {
    expect(getLoginErrorMessage(loginError('LOGIN_RATE_LIMITED', 180))).toBe(
      '로그인 시도가 너무 많습니다. 3분 후 다시 시도해 주세요.',
    )
    // 61초도 2분으로 올림해야 "아직인데?" 하는 재시도를 막는다.
    expect(getLoginErrorMessage(loginError('LOGIN_RATE_LIMITED', 61))).toContain('2분 후')
  })

  it('1분 미만은 초로 안내한다', () => {
    expect(getLoginErrorMessage(loginError('LOGIN_RATE_LIMITED', 30))).toContain('30초 후')
  })

  it('Retry-After가 없으면 시간을 단정하지 않는다', () => {
    expect(getLoginErrorMessage(loginError('LOGIN_RATE_LIMITED'))).toContain('잠시 후')
  })

  it('다른 오류는 호출부 기본 문구에 맡긴다', () => {
    expect(getLoginErrorMessage(loginError('INVALID_CREDENTIALS'))).toBeNull()
    expect(getLoginErrorMessage(new Error('네트워크'))).toBeNull()
  })
})
