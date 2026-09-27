import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { routes } from '../../app/routes'
import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
import { RouteLoadingScreen } from '../../shared/ui'
import { useAuth } from './useAuth'

export function RequireAuth() {
  const { isAuthenticated, isInitializing, logoutReason, pendingConsents } =
    useAuth()
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

  // 서버는 미동의로 API를 막지 않으니 게이팅은 여기서만 한다.
  // 동의 화면 자신은 통과시켜야 무한 리다이렉트가 안 난다.
  if (
    isApiCapabilityEnabled('policy-consent') &&
    pendingConsents.length > 0 &&
    location.pathname !== routes.consents
  ) {
    return <Navigate replace to={routes.consents} />
  }

  return <Outlet />
}
