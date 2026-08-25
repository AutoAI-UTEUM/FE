import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatDateTime,
  formatDetailedRelativeActivityDate,
  formatFileSize,
  formatRelativeActivityDate,
} from './format'

describe('format helpers', () => {
  it('formats ISO strings as Korean dates', () => {
    expect(formatDate('2026-07-22T00:00:00Z')).toMatch(/2026/)
    const dateTime = formatDateTime('2026-07-22T09:30:00Z')
    expect(dateTime).toMatch(/2026/)
    expect(dateTime).toMatch(/오전|오후/)
    expect(dateTime).not.toMatch(/\b(?:AM|PM)\b/)
  })

  it('returns the raw string for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('formats file sizes across units', () => {
    expect(formatFileSize(undefined)).toBe('-')
    expect(formatFileSize(512)).toBe('512B')
    expect(formatFileSize(2048)).toBe('2KB')
    expect(formatFileSize(12_480_000)).toBe('11.9MB')
  })

  it('formats recent activity by Korean calendar date', () => {
    const now = new Date('2026-08-13T09:00:00+09:00')

    expect(formatRelativeActivityDate('2026-08-13T01:00:00+09:00', now)).toBe('오늘')
    expect(formatRelativeActivityDate('2026-08-12T23:00:00+09:00', now)).toBe('어제')
    expect(formatRelativeActivityDate('2026-08-10T23:30:00+09:00', now)).toBe('3일 전')
    expect(formatRelativeActivityDate(undefined, now)).toBe('기록 없음')
  })

  it('adds minute and hour detail for activity from today', () => {
    const now = new Date('2026-08-13T15:30:00+09:00')

    expect(formatDetailedRelativeActivityDate('2026-08-13T15:29:45+09:00', now)).toBe('방금 전')
    expect(formatDetailedRelativeActivityDate('2026-08-13T15:07:00+09:00', now)).toBe('23분 전')
    expect(formatDetailedRelativeActivityDate('2026-08-13T12:10:00+09:00', now)).toBe('3시간 전')
    expect(formatDetailedRelativeActivityDate('2026-08-12T23:59:00+09:00', now)).toBe('어제')
    expect(formatDetailedRelativeActivityDate('2026-08-10T23:30:00+09:00', now)).toBe('3일 전')
    expect(formatDetailedRelativeActivityDate(undefined, now)).toBe('기록 없음')
  })
})
