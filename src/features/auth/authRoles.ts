const ADMIN_ROLES = new Set(['ADMIN'])
const INSTRUCTOR_ROLES = new Set(['INSTRUCTOR', 'TEACHER'])

export function isAdminRole(role: string | undefined): boolean {
  return role ? ADMIN_ROLES.has(role.toUpperCase()) : false
}

export function isInstructorRole(role: string | undefined): boolean {
  return role ? INSTRUCTOR_ROLES.has(role.toUpperCase()) : false
}

export function getRoleLabel(role: string | undefined): string {
  if (isAdminRole(role)) return '관리자'
  return isInstructorRole(role) ? '강의자' : '학습자'
}
