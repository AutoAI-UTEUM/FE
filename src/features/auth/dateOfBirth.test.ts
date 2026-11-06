import { describe, expect, it } from 'vitest'
import { getSeoulToday, validateDateOfBirth } from './dateOfBirth'

describe('birthdate validation against Seoul calendar days', () => {
  it.each([undefined, '', '0000-01-01', '2000-02-30', '1900-02-29', '2001-04-31', '2000-00-01', '2000-13-01', '2000-01-00', '2000-2-3', '2000-01-01T00:00:00Z'])('rejects missing or invalid date %s', (date) => {
    expect(validateDateOfBirth(date)).toBeTruthy()
  })

  it.each(['0001-01-01', '2000-02-29', '2004-02-29'])('accepts real past date %s without age assumptions', (date) => {
    expect(validateDateOfBirth(date, new Date('2026-11-04T00:00:00Z'))).toBeUndefined()
  })

  it('switches today at Seoul midnight and never converts the entered date', () => {
    const before = new Date('2026-11-03T14:59:59Z')
    const after = new Date('2026-11-03T15:00:00Z')
    expect(getSeoulToday(before)).toBe('2026-11-03')
    expect(getSeoulToday(after)).toBe('2026-11-04')
    expect(validateDateOfBirth('2026-11-04', before)).toBeTruthy()
    expect(validateDateOfBirth('2026-11-04', after)).toBeUndefined()
    expect(validateDateOfBirth('2026-11-05', after)).toBeTruthy()
  })
})
