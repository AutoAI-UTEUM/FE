import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { routes } from '../../app/routes'
import { RouteLoadingScreen } from '../../shared/ui'
import { useAuth } from './useAuth'
import { requiresEmailVerification } from './launchAuthContract'

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
      />
    )
  }

  if (requiresEmailVerification(user) &&
      ![routes.settings, routes.feedback, routes.updates].some((path) => location.pathname === path)) {
    return <Navigate to={routes.verifyEmail} replace />
  }

  return <Outlet />
}
