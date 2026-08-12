export function formatClassroomWeekPeriod(
  startDate: string,
  endDate: string,
  position: number,
): string {
  const courseStart = parseLocalDate(startDate)
  const courseEnd = parseLocalDate(endDate)
  if (!courseStart || !courseEnd || position < 1) return ''

  const weekStart = addDays(courseStart, (position - 1) * 7)
  if (weekStart > courseEnd) return ''
  const calculatedEnd = addDays(weekStart, 6)
  const weekEnd = calculatedEnd > courseEnd ? courseEnd : calculatedEnd
  return `${formatCompactDate(weekStart)} - ${formatCompactDate(weekEnd)}`
}

function parseLocalDate(value: string): Date | null {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function formatCompactDate(date: Date): string {
  return `${date.getMonth() + 1}.${date.getDate()}`
}
