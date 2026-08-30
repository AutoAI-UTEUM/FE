import { describe, expect, it } from 'vitest'

import { getRoleLabel, isAdminRole, isInstructorRole } from './authRoles'

describe('auth roles', () => {
  it('keeps administrators separate from instructors', () => {
    expect(isAdminRole('ADMIN')).toBe(true)
    expect(isInstructorRole('ADMIN')).toBe(false)
    expect(getRoleLabel('ADMIN')).toBe('관리자')
    expect(isInstructorRole('INSTRUCTOR')).toBe(true)
  })
})
