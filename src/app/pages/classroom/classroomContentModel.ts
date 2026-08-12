import type { ClassroomMaterial, ClassroomNotice, ClassroomWeek } from '../../../features/classrooms'
import type { Exam } from '../../../features/exams'

export type ClassroomContentFilter = 'all' | 'exam' | 'material' | 'notice'

export type ClassroomContentItem =
  | { id: string; kind: 'material'; occurredAt: string; source: ClassroomMaterial; title: string; weekNumber: number; weekOrder: number }
  | { id: string; kind: 'notice'; occurredAt: string; source: ClassroomNotice; title: string; weekNumber: number | null; weekOrder: number | null }
  | { id: string; kind: 'exam'; occurredAt: string; source: Exam; title: string; weekNumber: number | null; weekOrder: number | null }

export function buildClassroomContent(
  weeks: ClassroomWeek[],
  notices: ClassroomNotice[],
  exams: Exam[],
): ClassroomContentItem[] {
  const weekOrderByNumber = new Map(
    weeks.map((week) => [week.weekNumber, week.displayOrder]),
  )

  return [
    ...weeks.flatMap((week) => week.materials.map((material): ClassroomContentItem => ({
      id: `material-${material.id}`,
      kind: 'material',
      occurredAt: material.uploadedAt,
      source: material,
      title: material.title,
      weekNumber: week.weekNumber,
      weekOrder: week.displayOrder,
    }))),
    ...notices.map((notice): ClassroomContentItem => ({
      id: `notice-${notice.id}`,
      kind: 'notice',
      occurredAt: notice.updatedAt || notice.publishedAt,
      source: notice,
      title: notice.title,
      weekNumber: notice.weekNumber,
      weekOrder: resolveWeekOrder(notice.weekNumber, weekOrderByNumber),
    })),
    ...exams.map((exam): ClassroomContentItem => ({
      id: `exam-${exam.id}`,
      kind: 'exam',
      occurredAt: exam.updatedAt || exam.publishedAt || exam.createdAt || '',
      source: exam,
      title: exam.title,
      weekNumber: exam.weekNumber ?? null,
      weekOrder: resolveWeekOrder(exam.weekNumber, weekOrderByNumber),
    })),
  ].sort(compareContentItems)
}

export function filterClassroomContent(
  items: ClassroomContentItem[],
  weekNumber: number | null,
  filter: ClassroomContentFilter,
): ClassroomContentItem[] {
  const filteredItems = items.filter((item) => (
    (weekNumber === null ? item.weekNumber !== null : item.weekNumber === weekNumber)
    && (filter === 'all' || item.kind === filter)
  ))

  return weekNumber === null
    ? [...filteredItems].sort(compareAllContentItems)
    : filteredItems
}

export function getGlobalClassroomContent(
  items: ClassroomContentItem[],
  filter: ClassroomContentFilter,
): ClassroomContentItem[] {
  return items.filter((item) => item.weekNumber === null && (filter === 'all' || item.kind === filter))
}

function compareContentItems(left: ClassroomContentItem, right: ClassroomContentItem): number {
  const timeDifference = toTimestamp(right.occurredAt) - toTimestamp(left.occurredAt)
  if (timeDifference !== 0) return timeDifference
  return left.title.localeCompare(right.title, 'ko')
}

function compareAllContentItems(left: ClassroomContentItem, right: ClassroomContentItem): number {
  const weekDifference = (left.weekOrder ?? 0) - (right.weekOrder ?? 0)
  return weekDifference || compareContentItems(left, right)
}

function resolveWeekOrder(
  weekNumber: number | null | undefined,
  weekOrderByNumber: Map<number, number>,
): number | null {
  if (weekNumber == null) return null
  return weekOrderByNumber.get(weekNumber) ?? weekNumber
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}
