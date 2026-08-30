import { createContext } from 'react'

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

export interface AuthUser {
  affiliation?: string
  avatarUrl?: string
  email: string
  id?: number
  learningEmailOptIn?: boolean
  name: string
  role?: string
}

export type LogoutReason = 'idle' | 'manual' | 'session-expired'

export type AuthenticatedRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<ApiSuccess<T>>

export type AuthenticatedRawRequest = (
  path: string,
  options?: RawApiRequestOptions,
) => Promise<Response>

export interface AuthContextValue {
  apiRequest: AuthenticatedRequest
  rawApiRequest: AuthenticatedRawRequest
  checkEmailAvailability: (
    email: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  clearGoogleSignup: () => void
  isAuthenticated: boolean
  isInitializing: boolean
  login: (values: LoginFormValues) => Promise<AuthUser>
  loginWithGoogle: (values: GoogleAuthValues) => Promise<AuthUser>
  logoutReason: LogoutReason | null
  logout: () => Promise<void>
  pendingGoogleIdToken: string | null
  prepareGoogleSignup: (idToken: string) => void
  signup: (values: SignupFormValues) => Promise<void>
  user: AuthUser | null
  updateUser: (user: AuthUser) => void
  withdraw: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
