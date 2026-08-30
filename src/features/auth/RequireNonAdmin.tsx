import { Navigate, Outlet } from 'react-router-dom'

import { routes } from '../../app/routes'
import { isAdminRole } from './authRoles'
import { useAuth } from './useAuth'

export function RequireNonAdmin() {
  const { user } = useAuth()

  return isAdminRole(user?.role)
    ? <Navigate to={routes.admin} replace />
    : <Outlet />
}
