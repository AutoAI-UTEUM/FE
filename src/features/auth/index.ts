export {
  AUTH_IDLE_TIMEOUT_MS,
  AUTH_RESTORE_TIMEOUT_MS,
  AuthProvider,
} from './AuthProvider'
export { RequireAuth } from './RequireAuth'
export { RequireInstructor } from './RequireInstructor'
export { RequireAdmin } from './RequireAdmin'
export { RequireNonAdmin } from './RequireNonAdmin'
export { GoogleSignInButton } from './GoogleSignInButton'
export { useAuth } from './useAuth'
export { createUserSettingsRepository } from './userSettingsRepository'
export type { AiAnswerStyle, UserPreferences } from './userSettingsRepository'
export { getRoleLabel, isAdminRole, isInstructorRole } from './authRoles'
export type { AuthContextValue, AuthUser } from './authContext'
export type {
  AuthenticatedRawRequest,
  AuthenticatedRequest,
  LogoutReason,
} from './authContext'
export {
  AuthValidationError,
  mapAuthErrorToFormErrors,
} from './authErrors'
export {
  hasFormErrors,
  validateLoginForm,
  validateSignupForm,
  type GoogleAuthValues,
  type LoginFormErrors,
  type LoginFormValues,
  type SignupFormErrors,
  type SignupFormValues,
  type SignupRole,
} from './authValidation'
