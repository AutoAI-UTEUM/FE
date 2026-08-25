import { Outlet } from 'react-router-dom'

import { routes } from '../../app/routes'
import { ButtonLink, ErrorState, PageContainer } from '../../shared/ui'
import { isInstructorRole } from './authRoles'
import { useAuth } from './useAuth'

export function RequireInstructor() {
  const { user } = useAuth()

  if (!isInstructorRole(user?.role)) {
    return <PageContainer><ErrorState action={<ButtonLink to={routes.classrooms}>내 강의실로</ButtonLink>} description="이 페이지는 강의실을 운영하는 강사만 사용할 수 있습니다." title="접근 권한이 없습니다" /></PageContainer>
  }

  return <Outlet />
}
