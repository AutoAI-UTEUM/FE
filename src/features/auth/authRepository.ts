import { apiRequest, ApiClientError } from '../../shared/api'
import type { AuthUser } from './authContext'
import { AuthValidationError } from './authErrors'
import type {
  GoogleAuthValues,
  LoginFormValues,
  SignupFormErrors,
  SignupFormValues,
} from './authValidation'

export interface AuthSessionResult {
  accessToken: string
  user: AuthUser
}

export interface AuthRepository {
  checkEmailAvailability: (
    email: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  getMe: (accessToken: string, signal?: AbortSignal) => Promise<AuthUser>
  loginWithGoogle: (values: GoogleAuthValues) => Promise<AuthSessionResult>
  login: (values: LoginFormValues) => Promise<AuthSessionResult>
  logout: () => Promise<void>
  refresh: (signal?: AbortSignal) => Promise<string>
  signup: (values: SignupFormValues) => Promise<void>
}

interface LoginResponseDto {
  accessToken: string
  expiresIn: number
  tokenType: string
  user: {
    affiliation?: string
    avatarUrl?: string
    email: string
    id: number
    learningEmailOptIn?: boolean
    name: string
    role: string
  }
}

interface UserResponseDto {
  affiliation?: string
  avatarUrl?: string
  email: string
  id?: number
  learningEmailOptIn?: boolean
  name: string
  role?: string
  userId?: number
}

const repository: AuthRepository = {
  async checkEmailAvailability(email, signal) {
    const query = new URLSearchParams({
      email: email.trim().toLowerCase(),
    })
    const { data } = await apiRequest<{ available: boolean }>(
      `/api/auth/email-availability?${query.toString()}`,
      { signal },
    )
    return data.available
  },

  async getMe(accessToken, signal) {
    const { data } = await apiRequest<UserResponseDto>('/api/users/me', {
      accessToken,
      signal,
    })
    return mapUser(data)
  },

  async login(values) {
    try {
      const { data } = await apiRequest<LoginResponseDto>('/api/auth/login', {
        body: {
          email: values.email.trim().toLowerCase(),
          password: values.password,
        },
        method: 'POST',
      })

      return {
        accessToken: data.accessToken,
        user: mapUser(data.user),
      }
    } catch (error) {
      throw mapRemoteAuthError(error, 'login')
    }
  },

  async loginWithGoogle(values) {
    const { data } = await apiRequest<LoginResponseDto>('/api/auth/google', {
      body: {
        affiliation: values.affiliation?.trim() || undefined,
        idToken: values.idToken,
        learningEmailOptIn: values.learningEmailOptIn,
        privacyVersion: values.privacyVersion,
        role: values.role,
        termsVersion: values.termsVersion,
      },
      method: 'POST',
    })

    return {
      accessToken: data.accessToken,
      user: mapUser(data.user),
    }
  },

  async logout() {
    await apiRequest<unknown>('/api/auth/logout', { method: 'POST' })
  },

  // refresh 쿠키(edupilot_refresh)로 access 토큰을 재발급받는다 (DEC-004).
  async refresh(signal) {
    const { data } = await apiRequest<{ accessToken: string }>(
      '/api/auth/refresh',
      { method: 'POST', signal },
    )
    return data.accessToken
  },

  async signup(values) {
    try {
      await apiRequest<UserResponseDto>('/api/auth/signup', {
        body: {
          affiliation: values.affiliation?.trim() || undefined,
          email: values.email.trim().toLowerCase(),
          learningEmailOptIn: values.learningEmailOptIn ?? false,
          name: values.name.trim(),
          password: values.password,
          privacyVersion: '2026-07-01',
          role: values.role,
          termsVersion: '2026-07-01',
        },
        method: 'POST',
      })
    } catch (error) {
      throw mapRemoteAuthError(error, 'signup')
    }
  },
}

export function getAuthRepository(): AuthRepository {
  return repository
}

function mapUser(user: UserResponseDto): AuthUser {
  return {
    affiliation: user.affiliation,
    avatarUrl: user.avatarUrl,
    email: user.email,
    id: user.id ?? user.userId,
    learningEmailOptIn: user.learningEmailOptIn,
    name: user.name,
    role: user.role,
  }
}

function mapRemoteAuthError(
  error: unknown,
  operation: 'login' | 'signup',
): unknown {
  if (!(error instanceof ApiClientError)) {
    return error
  }

  const formErrors: SignupFormErrors = {}

  if (operation === 'login') {
    if (error.code === 'INVALID_CREDENTIALS') {
      formErrors.email = '이메일 또는 비밀번호를 확인하세요.'
    } else if (error.code === 'USER_INACTIVE') {
      formErrors.email = '비활성화된 계정입니다.'
    }
  } else if (error.code === 'EMAIL_ALREADY_EXISTS') {
    formErrors.email = '이미 가입된 이메일입니다.'
  }

  if (error.code === 'VALIDATION_FAILED') {
    for (const detail of error.details) {
      if (isFieldDetail(detail)) {
        formErrors[detail.field] = detail.reason
      }
    }
  }

  return Object.keys(formErrors).length > 0
    ? new AuthValidationError(error.message, formErrors)
    : error
}

const FORM_FIELDS = ['affiliation', 'email', 'name', 'password', 'role'] as const

function isFieldDetail(
  detail: unknown,
): detail is { field: keyof SignupFormErrors; reason: string } {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    'field' in detail &&
    'reason' in detail &&
    typeof (detail as { reason: unknown }).reason === 'string' &&
    FORM_FIELDS.includes((detail as { field: string }).field as never)
  )
}
