export function getSeoulToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
}

// Validate the calendar string without converting the submitted date to a timestamp.
export function validateDateOfBirth(value?: string, now = new Date()): string | undefined {
  if (!value) return '생년월일을 입력하세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return '생년월일을 YYYY-MM-DD 형식으로 입력하세요.'
  }
  const [year, month, day] = value.split('-').map(Number)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    return '올바른 날짜를 입력하세요.'
  }
  if (value > getSeoulToday(now)) return '생년월일은 오늘 이후 날짜일 수 없습니다.'
  return undefined
}
