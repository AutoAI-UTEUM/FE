import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthenticatedRequest } from '../auth'

export type CalendarEventKind = 'NOTICE' | 'PERSONAL'

export interface CalendarEvent {
  backendId: string
  createdAt: string
  endsAt: string
  hasTime: boolean
  id: string
  kind: CalendarEventKind
  startsAt: string
  title: string
  source: 'remote'
}

export interface CreateCalendarEventInput {
  endsAt: string
  hasTime: boolean
  startsAt: string
  title: string
}

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput>

const CALENDAR_EVENTS_CHANGED = 'edupilot:calendar-events-changed'

interface ScheduleDto {
  classroomName?: string
  dateTime?: string
  endsAt?: string
  hasTime?: boolean
  kind?: 'WEEK_RELEASE' | 'NOTICE_PUBLISH' | 'PERSONAL'
  scheduleId: string
  startsAt?: string
  title: string
  type?: 'WEEK_RELEASE' | 'NOTICE_PUBLISH' | 'PERSONAL'
}

interface PersonalScheduleDto {
  endsAt: string
  hasTime: boolean
  kind: 'PERSONAL'
  scheduleId: string
  startsAt: string
  title: string
}

export function createCalendarRepository(request: AuthenticatedRequest) {
  return {
    async list(signal?: AbortSignal) {
      const from = new Date()
      from.setMonth(from.getMonth() - 6)
      const to = new Date()
      to.setMonth(to.getMonth() + 12)
      const format = (date: Date) => date.toISOString().slice(0, 10)
      const query = new URLSearchParams({ from: format(from), to: format(to) })
      const { data } = await request<{ items: ScheduleDto[] }>(
        `/api/users/me/schedule?${query}`,
        { signal },
      )
      return data.items
        .filter((item) => getScheduleKind(item) !== 'WEEK_RELEASE')
        .map(mapSchedule)
    },
    async create(input: CreateCalendarEventInput) {
      const { data } = await request<PersonalScheduleDto>('/api/users/me/schedule', {
        body: { ...input },
        method: 'POST',
      })
      return mapPersonalSchedule(data)
    },
    async update(scheduleId: string, input: UpdateCalendarEventInput) {
      const { data } = await request<PersonalScheduleDto>(
        `/api/users/me/schedule/${encodeURIComponent(scheduleId)}`,
        { body: { ...input }, method: 'PATCH' },
      )
      return mapPersonalSchedule(data)
    },
    async remove(scheduleId: string) {
      await request(`/api/users/me/schedule/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
      })
    },
  }
}

export function useCalendarEvents(
  ownerKey: string | number | undefined,
  request?: AuthenticatedRequest,
) {
  const repository = useMemo(
    () => request ? createCalendarRepository(request) : null,
    [request],
  )
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(Boolean(request && ownerKey))

  useEffect(() => {
    if (!repository || !ownerKey) {
      return
    }
    const controller = new AbortController()
    repository.list(controller.signal)
      .then((items) => {
        setEvents(items)
        setError(null)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [ownerKey, repository])

  useEffect(() => {
    const synchronize = (browserEvent: Event) => {
      if (!(browserEvent instanceof CustomEvent)) return
      const detail = browserEvent.detail as { event?: CalendarEvent; eventId?: string; type?: 'remove' | 'upsert' }
      if (detail.type === 'remove' && detail.eventId) {
        setEvents((current) => current.filter((item) => item.id !== detail.eventId))
      }
      if (detail.type === 'upsert' && detail.event) {
        setEvents((current) => [
          ...current.filter((item) => item.id !== detail.event?.id),
          detail.event as CalendarEvent,
        ].sort(compareEvents))
      }
    }
    window.addEventListener(CALENDAR_EVENTS_CHANGED, synchronize)
    return () => window.removeEventListener(CALENDAR_EVENTS_CHANGED, synchronize)
  }, [])

  const addEvent = useCallback(
    async (input: CreateCalendarEventInput) => {
      if (!repository) throw new Error('인증된 일정 API가 필요합니다.')
      const event = await repository.create(input)
      notifyCalendarChanged({ event, type: 'upsert' })
      return event
    },
    [repository],
  )

  const updateEvent = useCallback(
    async (event: CalendarEvent, input: UpdateCalendarEventInput) => {
      if (!repository || event.kind !== 'PERSONAL') {
        throw new Error('개인 일정만 수정할 수 있습니다.')
      }
      const updated = await repository.update(event.backendId, input)
      notifyCalendarChanged({ event: updated, type: 'upsert' })
      return updated
    },
    [repository],
  )

  const removeEvent = useCallback(
    async (event: CalendarEvent) => {
      if (!repository || event.kind !== 'PERSONAL') {
        throw new Error('개인 일정만 삭제할 수 있습니다.')
      }
      await repository.remove(event.backendId)
      notifyCalendarChanged({ eventId: event.id, type: 'remove' })
    },
    [repository],
  )

  return { addEvent, error, events, isLoading, removeEvent, updateEvent }
}

export function getCalendarEventKindLabel(kind: CalendarEventKind): string {
  switch (kind) {
    case 'NOTICE':
      return '공지'
    case 'PERSONAL':
      return '개인 일정'
  }
}

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
}

function notifyCalendarChanged(detail: { event?: CalendarEvent; eventId?: string; type: 'remove' | 'upsert' }) {
  window.dispatchEvent(new CustomEvent(CALENDAR_EVENTS_CHANGED, { detail }))
}

function mapSchedule(value: ScheduleDto): CalendarEvent {
  const startsAt = value.startsAt ?? value.dateTime ?? ''
  const kind: CalendarEventKind = getScheduleKind(value) === 'NOTICE_PUBLISH'
    ? 'NOTICE'
    : 'PERSONAL'
  return {
    backendId: String(value.scheduleId),
    createdAt: startsAt,
    endsAt: value.endsAt ?? startsAt,
    hasTime: value.hasTime ?? true,
    id: `remote-${value.scheduleId}`,
    kind,
    source: 'remote',
    startsAt,
    title: kind === 'PERSONAL' || !value.classroomName
      ? value.title
      : `${value.classroomName} · ${value.title}`,
  }
}

function getScheduleKind(value: ScheduleDto): NonNullable<ScheduleDto['kind']> {
  return value.kind ?? value.type ?? 'PERSONAL'
}

function mapPersonalSchedule(value: PersonalScheduleDto): CalendarEvent {
  return {
    backendId: String(value.scheduleId),
    createdAt: value.startsAt,
    endsAt: value.endsAt,
    hasTime: value.hasTime,
    id: `remote-${value.scheduleId}`,
    kind: 'PERSONAL',
    source: 'remote',
    startsAt: value.startsAt,
    title: value.title,
  }
}
