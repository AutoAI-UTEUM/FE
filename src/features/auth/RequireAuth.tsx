import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { routes } from '../../app/routes'
import { RouteLoadingScreen } from '../../shared/ui'
import { createAuthReturnState } from './authReturnTarget'
import { useAuth } from './useAuth'
import { requiresEmailVerification } from './launchAuthContract'
import { isGuardianTeamReady } from '../guardian/guardianContract'

export function RequireAuth() {
  const { isAuthenticated, isInitializing, logoutReason, user } = useAuth()
  const location = useLocation()

  if (isInitializing) {
    return <RouteLoadingScreen message="로그인 상태를 확인하는 중입니다." />
  }

  if (!isAuthenticated) {
    const reason =
      logoutReason === 'idle'
        ? '?reason=idle'
        : logoutReason === 'absolute-expired'
          ? '?reason=absolute-expired'
          : logoutReason === 'inactive'
            ? '?reason=inactive'
        : logoutReason === 'session-expired'
          ? '?reason=session-expired'
          : ''

    return (
      <Navigate
        to={`${routes.login}${reason}`}
        replace
        state={
          logoutReason === 'manual'
            ? undefined
            : createAuthReturnState(location, window.location.origin)
        }
      />
    )
  }

  if (requiresEmailVerification(user) &&
      !(isGuardianTeamReady() && location.pathname === routes.guardianRequest) &&
      ![routes.settings, routes.feedback, routes.updates].some((path) => location.pathname === path)) {
    return <Navigate to={routes.verifyEmail} replace />
  }

  return <Outlet />
}
