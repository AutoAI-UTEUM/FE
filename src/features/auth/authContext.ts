import { createContext } from 'react'
import type { EmailVerificationFields } from './launchAuthContract'
import type { SignupAccount } from './authRepository'

import type {
  ApiRequestOptions,
  ApiSuccess,
  RawApiRequestOptions,
} from '../../shared/api'
import type {
  GoogleAuthValues,
  LoginFormValues,
  SignupFormValues,
} from './authValidation'

export interface AuthUser extends EmailVerificationFields {
  affiliation?: string
  avatarUrl?: string
  email: string
  id?: number
  learningEmailOptIn?: boolean
  name: string
  role?: string
}

export type LogoutReason =
  | 'absolute-expired'
  | 'idle'
  | 'inactive'
  | 'manual'
  | 'session-expired'

export type AuthenticatedRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<ApiSuccess<T>>

export type AuthenticatedRawRequest = (
  path: string,
  options?: RawApiRequestOptions,
) => Promise<Response>

export type SignupResult =
  | { status: 'account-created'; account?: SignupAccount }
  | { status: 'authenticated'; user?: AuthUser }

export interface AuthContextValue {
  apiRequest: AuthenticatedRequest
  rawApiRequest: AuthenticatedRawRequest
  refreshCurrentUser?: (signal?: AbortSignal) => Promise<AuthUser | null>
  checkEmailAvailability: (
    email: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  clearGoogleSignup: () => void
  isAuthenticated: boolean
  isInitializing: boolean
  login: (values: LoginFormValues) => Promise<AuthUser>
  loginWithGoogle: (values: GoogleAuthValues, signal?: AbortSignal) => Promise<AuthUser>
  logoutReason: LogoutReason | null
  logout: () => Promise<void>
  pendingGoogleIdToken: string | null
  prepareGoogleSignup: (idToken: string) => void
  setExamInProgress: (isInProgress: boolean) => void
  signup: (
    values: SignupFormValues,
    signal?: AbortSignal,
  ) => Promise<SignupResult>
  user: AuthUser | null
  updateUser: (user: AuthUser) => void
  withdraw: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
