import { Navigate, Outlet } from 'react-router-dom'

import { routes } from '../../app/routes'
import { isAdminRole } from './authRoles'
import { useAuth } from './useAuth'

export function RequireAdmin() {
  const { user } = useAuth()

  return isAdminRole(user?.role)
    ? <Outlet />
    : <Navigate to={routes.classrooms} replace />
}
