import { Navigate, Outlet } from 'react-router-dom'

import { routes } from '../../app/routes'
import { LoadingState } from '../../shared/ui'
import { useAuth } from './useAuth'

export function RequireAuth() {
  const { isAuthenticated, isInitializing, logoutReason } = useAuth()

  if (isInitializing) {
    return <LoadingState message="로그인 상태를 확인하는 중입니다." />
  }

  if (!isAuthenticated) {
    const reason =
      logoutReason === 'idle'
        ? '?reason=idle'
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

  return <Outlet />
}
