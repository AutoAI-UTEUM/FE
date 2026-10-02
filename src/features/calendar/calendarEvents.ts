import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

interface CalendarScope {
  ownerKey: string | number | undefined
  repository: ReturnType<typeof createCalendarRepository> | null
}

interface CalendarState {
  error: unknown
  events: CalendarEvent[]
  hasLoaded: boolean
  isLoading: boolean
  scope: CalendarScope
}

interface CalendarChange {
  event?: CalendarEvent
  eventId?: string
  ownerKey: string | number
  type: 'remove' | 'upsert'
}

function initialCalendarState(scope: CalendarScope): CalendarState {
  return {
    error: null,
    events: [],
    hasLoaded: false,
    isLoading: Boolean(scope.repository && scope.ownerKey !== undefined && scope.ownerKey !== ''),
    scope,
  }
}

function applyCalendarChange(events: CalendarEvent[], change: CalendarChange): CalendarEvent[] {
  if (change.type === 'remove' && change.eventId) {
    return events.filter((item) => item.id !== change.eventId)
  }
  if (change.type === 'upsert' && change.event) {
    return [
      ...events.filter((item) => item.id !== change.event?.id),
      change.event,
    ].sort(compareEvents)
  }
  return events
}

export function useCalendarEvents(
  ownerKey: string | number | undefined,
  request?: AuthenticatedRequest,
) {
  const repository = useMemo(
    () => request ? createCalendarRepository(request) : null,
    [request],
  )
  const scope = useMemo(() => ({ ownerKey, repository }), [ownerKey, repository])
  const [state, setState] = useState(() => initialCalendarState(scope))
  const [reloadVersion, setReloadVersion] = useState(0)
  const activeScope = useRef<CalendarScope | null>(null)
  const activeLoad = useRef<AbortController | null>(null)

  // Reset before rendering another account, rather than showing its predecessor's
  // events for one frame while an effect clears the cache.
  if (state.scope !== scope) {
    const nextState = initialCalendarState(scope)
    if (repository && state.scope.ownerKey === ownerKey) {
      nextState.events = state.events
      nextState.hasLoaded = state.hasLoaded
    }
    setState(nextState)
  }

  useEffect(() => {
    activeScope.current = scope
    return () => { activeScope.current = null }
  }, [scope])

  useEffect(() => {
    if (!repository || ownerKey === undefined || ownerKey === '') return

    const controller = new AbortController()
    activeLoad.current = controller
    const changes: CalendarChange[] = []
    let isPending = true
    const synchronize = (browserEvent: Event) => {
      if (!(browserEvent instanceof CustomEvent)) return
      const change = browserEvent.detail as CalendarChange | undefined
      if (!change || change.ownerKey !== ownerKey) return
      if (isPending) changes.push(change)
      setState((current) => current.scope === scope
        ? { ...current, events: applyCalendarChange(current.events, change) }
        : current)
    }
    window.addEventListener(CALENDAR_EVENTS_CHANGED, synchronize)

    repository.list(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        isPending = false
        setState((current) => !controller.signal.aborted && current.scope === scope ? {
          ...current,
          error: null,
          // A slow list response must not undo a mutation that already succeeded.
          events: changes.reduce(applyCalendarChange, items),
          hasLoaded: true,
          isLoading: false,
        } : current)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        isPending = false
        setState((current) => !controller.signal.aborted && current.scope === scope
          ? { ...current, error, isLoading: false }
          : current)
      })

    return () => {
      controller.abort()
      if (activeLoad.current === controller) activeLoad.current = null
      window.removeEventListener(CALENDAR_EVENTS_CHANGED, synchronize)
    }
  }, [ownerKey, repository, scope, reloadVersion])

  const reload = useCallback(() => {
    if (!repository || ownerKey === undefined || ownerKey === '' || activeScope.current !== scope) return
    // Invalidate now: batched promise callbacks can run before effect cleanup.
    activeLoad.current?.abort()
    setState((current) => current.scope === scope
      ? { ...current, error: null, isLoading: true }
      : current)
    setReloadVersion((version) => version + 1)
  }, [ownerKey, repository, scope])

  const ensureActiveScope = useCallback(() => {
    if (activeScope.current !== scope) {
      throw new DOMException('일정 요청이 취소되었습니다.', 'AbortError')
    }
  }, [scope])

  const addEvent = useCallback(
    async (input: CreateCalendarEventInput) => {
      ensureActiveScope()
      if (!repository || ownerKey === undefined || ownerKey === '') throw new Error('인증된 일정 API가 필요합니다.')
      let event: CalendarEvent
      try {
        event = await repository.create(input)
      } finally {
        // Late successes and failures must not reach a different session's UI.
        ensureActiveScope()
      }
      notifyCalendarChanged({ event, ownerKey, type: 'upsert' })
      return event
    },
    [ensureActiveScope, ownerKey, repository],
  )

  const updateEvent = useCallback(
    async (event: CalendarEvent, input: UpdateCalendarEventInput) => {
      ensureActiveScope()
      if (!repository || ownerKey === undefined || ownerKey === '' || event.kind !== 'PERSONAL') {
        throw new Error('개인 일정만 수정할 수 있습니다.')
      }
      let updated: CalendarEvent
      try {
        updated = await repository.update(event.backendId, input)
      } finally {
        ensureActiveScope()
      }
      notifyCalendarChanged({ event: updated, ownerKey, type: 'upsert' })
      return updated
    },
    [ensureActiveScope, ownerKey, repository],
  )

  const removeEvent = useCallback(
    async (event: CalendarEvent) => {
      ensureActiveScope()
      if (!repository || ownerKey === undefined || ownerKey === '' || event.kind !== 'PERSONAL') {
        throw new Error('개인 일정만 삭제할 수 있습니다.')
      }
      try {
        await repository.remove(event.backendId)
      } finally {
        ensureActiveScope()
      }
      notifyCalendarChanged({ eventId: event.id, ownerKey, type: 'remove' })
    },
    [ensureActiveScope, ownerKey, repository],
  )

  return {
    addEvent,
    error: state.error,
    events: state.events,
    hasLoaded: state.hasLoaded,
    isLoading: state.isLoading,
    reload,
    removeEvent,
    updateEvent,
  }
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

function notifyCalendarChanged(detail: CalendarChange) {
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
