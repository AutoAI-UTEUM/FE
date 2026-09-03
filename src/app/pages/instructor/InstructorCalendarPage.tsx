import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useParams } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../../features/auth'
import { rememberClassroomId } from '../../../features/classrooms'
import {
  getCalendarEventKindLabel,
  useCalendarEvents,
  type CalendarEvent,
  type CalendarEventKind,
  type CreateCalendarEventInput,
} from '../../../features/calendar'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { cx } from '../../../shared/lib/cx'
import { Button, PageContainer, PageHeader, useToast } from '../../../shared/ui'
import { useResponsiveViewport } from '../../../shared/responsive'

type CalendarView = 'list' | 'month' | 'week'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

export function InstructorCalendarPage() {
  usePageTitle('캘린더')
  const { apiRequest, user } = useAuth()
  const { show: showToast } = useToast()
  const { mode } = useResponsiveViewport()
  const { classroomId = '' } = useParams()
  const isInstructor = isInstructorRole(user?.role)
  const { addEvent, events, removeEvent, updateEvent } = useCalendarEvents(
    user?.id ?? user?.email,
    apiRequest,
  )
  const today = useMemo(() => startOfDay(new Date()), [])
  const [cursor, setCursor] = useState(() => startOfMonth(today))
  const [view, setView] = useState<CalendarView>('month')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [pickerYear, setPickerYear] = useState(cursor.getFullYear())
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const lastWheelNavigationAt = useRef(0)

  useEffect(() => {
    if (classroomId) rememberClassroomId(classroomId)
  }, [classroomId])

  const label = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
  const isViewingCurrentMonth = isSameMonth(cursor, today)
  const visibleMonthEvents = useMemo(
    () => events.filter((event) => eventIntersectsMonth(event, cursor)),
    [cursor, events],
  )

  useEffect(() => {
    if (!isPickerOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsPickerOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPickerOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isPickerOpen])

  function move(direction: -1 | 1) {
    setCursor((current) =>
      view === 'week'
        ? addDays(current, direction * 7)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1),
    )
  }

  function moveToCurrentMonth() {
    setCursor(startOfMonth(today))
  }

  function handleMonthWheel(event: ReactWheelEvent<HTMLElement>) {
    if (Math.abs(event.deltaY) < 20 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
    event.preventDefault()
    const now = Date.now()
    if (now - lastWheelNavigationAt.current < 450) return
    lastWheelNavigationAt.current = now
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + (event.deltaY > 0 ? 1 : -1), 1))
  }

  function togglePicker() {
    setPickerYear(cursor.getFullYear())
    setIsPickerOpen((open) => !open)
  }

  function selectMonth(month: number) {
    setCursor(new Date(pickerYear, month, 1))
    setIsPickerOpen(false)
  }

  return (
    <PageContainer className={cx('lg:flex lg:h-[calc(100dvh-2.5rem)] lg:min-h-0 lg:flex-col lg:gap-5 lg:overflow-hidden lg:space-y-0', mode === 'tablet-portrait' && '!h-auto !overflow-visible')}>
      <PageHeader
        actions={
          <>
            <SegmentedControl onChange={setView} value={view} />
            {isInstructor ? (
              <Button
                aria-label="일정 추가"
                onClick={() => { setEditingEvent(null); setIsComposerOpen(true) }}
                size="sm"
              >
                <Plus aria-hidden="true" size={14} />
                개인 일정
              </Button>
            ) : null}
          </>
        }
        title="캘린더"
      />

      <div className={cx('grid min-h-0 gap-4 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_18rem]', mode === 'tablet-portrait' && '!grid-cols-1 !overflow-visible')}>
        <section
          aria-label="캘린더 본문"
          className="flex min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white lg:min-h-0"
        >
          <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-stone-200 px-3 sm:px-4">
            <span aria-hidden="true" />
            <div className="flex items-center gap-2" ref={pickerRef}>
              <button
                aria-label="이전 기간"
                className="flex size-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 mobile-web:size-11"
                onClick={() => move(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={15} />
              </button>
              <div className="relative">
                <button
                  aria-expanded={isPickerOpen}
                  aria-haspopup="dialog"
                  aria-label="연도와 월 선택"
                  className="flex h-8 min-w-28 items-center justify-center gap-1.5 rounded-lg px-2 type-body font-bold text-stone-900 hover:bg-stone-100 sm:min-w-36"
                  onClick={togglePicker}
                  type="button"
                >
                  {label}
                  <ChevronDown aria-hidden="true" size={14} />
                </button>
                {isPickerOpen ? (
                  <MonthYearPicker
                    onChangeYear={setPickerYear}
                    onSelectMonth={selectMonth}
                    selectedMonth={cursor.getMonth()}
                    selectedYear={cursor.getFullYear()}
                    year={pickerYear}
                  />
                ) : null}
              </div>
              <button
                aria-label="다음 기간"
                className="flex size-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 mobile-web:size-11"
                onClick={() => move(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={15} />
              </button>
            </div>
            {!isViewingCurrentMonth && view !== 'list' ? (
              <Button
                className="justify-self-end"
                onClick={moveToCurrentMonth}
                size="sm"
                variant="secondary"
              >
                이번 달
              </Button>
            ) : null}
          </div>

          {view === 'month' ? (
            <MonthView
              cursor={cursor}
              events={events}
              onWheel={handleMonthWheel}
              onSelectEvent={setSelectedEvent}
              today={today}
            />
          ) : null}
          {view === 'week' ? (
            <WeekView
              cursor={cursor}
              events={events}
              onSelectEvent={setSelectedEvent}
              today={today}
            />
          ) : null}
          {view === 'list' ? (
            <ListView events={events} onSelectEvent={setSelectedEvent} />
          ) : null}
        </section>

        <MonthlySchedulePanel
          events={visibleMonthEvents}
          onSelectEvent={setSelectedEvent}
        />
      </div>

      {isInstructor && isComposerOpen ? (
        <ScheduleComposer
          initialEvent={editingEvent ?? undefined}
          initialDate={getInitialScheduleDate(cursor, today)}
          onClose={() => { setEditingEvent(null); setIsComposerOpen(false) }}
          onSubmit={async (input) => {
            try {
              const event = editingEvent
                ? await updateEvent(editingEvent, input)
                : await addEvent(input)
              setCursor(startOfMonth(new Date(event.startsAt)))
              setEditingEvent(null)
              setIsComposerOpen(false)
              showToast(editingEvent ? '일정을 수정했습니다.' : '일정을 추가했습니다.', 'success')
            } catch (requestError) {
              showToast(getRequestErrorMessage(requestError), 'danger')
            }
          }}
        />
      ) : null}

      {selectedEvent ? (
        <ScheduleDetailDialog
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={isInstructor && selectedEvent.kind === 'PERSONAL' ? () => {
            setEditingEvent(selectedEvent)
            setSelectedEvent(null)
            setIsComposerOpen(true)
          } : undefined}
          onRemove={isInstructor && selectedEvent.kind === 'PERSONAL' ? async () => {
            try {
              await removeEvent(selectedEvent)
              setSelectedEvent(null)
              showToast('일정을 삭제했습니다.', 'success')
            } catch (requestError) {
              showToast(getRequestErrorMessage(requestError), 'danger')
            }
          } : undefined}
        />
      ) : null}
    </PageContainer>
  )
}

function MonthYearPicker({
  onChangeYear,
  onSelectMonth,
  selectedMonth,
  selectedYear,
  year,
}: {
  onChangeYear: (year: number) => void
  onSelectMonth: (month: number) => void
  selectedMonth: number
  selectedYear: number
  year: number
}) {
  return (
    <div
      aria-label="연도와 월 선택"
      className="absolute top-[calc(100%+8px)] left-1/2 z-30 w-64 -translate-x-1/2 rounded-lg border border-stone-200 bg-white p-3 shadow-xl"
      role="dialog"
    >
      <label className="flex items-center justify-between gap-3 type-caption font-semibold text-stone-500">
        연도
        <select
          aria-label="연도 선택"
          className="h-9 flex-1 rounded-lg border border-stone-200 bg-white px-3 type-body font-bold text-stone-900"
          onChange={(event) => onChangeYear(Number(event.target.value))}
          value={year}
        >
          {Array.from({ length: 101 }, (_, index) => 2000 + index).map(
            (optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}년
              </option>
            ),
          )}
        </select>
      </label>
      <div className="mt-3 grid grid-cols-4 gap-1">
        {Array.from({ length: 12 }, (_, month) => (
          <button
            aria-pressed={
              selectedYear === year && selectedMonth === month
            }
            className={cx(
              'h-9 rounded-md type-caption font-semibold',
              selectedYear === year && selectedMonth === month
                ? 'bg-brand-600 text-white'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950',
            )}
            key={month}
            onClick={() => onSelectMonth(month)}
            type="button"
          >
            {month + 1}월
          </button>
        ))}
      </div>
    </div>
  )
}

function SegmentedControl({
  onChange,
  value,
}: {
  onChange: (value: CalendarView) => void
  value: CalendarView
}) {
  return (
    <div
      aria-label="캘린더 보기"
      className="inline-flex rounded-lg border border-stone-200 bg-white p-1"
      role="group"
    >
      {[
        ['month', '월'],
        ['week', '주'],
        ['list', '목록'],
      ].map(([option, label]) => (
        <button
          aria-pressed={value === option}
          className={cx(
            'h-8 min-w-10 rounded-md px-2.5 type-caption font-semibold',
            value === option
              ? 'bg-stone-900 text-white dark:bg-stone-200 dark:text-stone-950'
              : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
          )}
          key={option}
          onClick={() => onChange(option as CalendarView)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function MonthView({
  cursor,
  events,
  onWheel,
  onSelectEvent,
  today,
}: {
  cursor: Date
  events: CalendarEvent[]
  onWheel: (event: ReactWheelEvent<HTMLElement>) => void
  onSelectEvent: (event: CalendarEvent) => void
  today: Date
}) {
  const cells = getMonthCells(cursor)

  return (
    <section aria-label="월간 캘린더" className="flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-4 lg:min-h-0" onWheel={onWheel}>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            className={cx(
              'px-2 py-2.5 text-center type-micro font-semibold',
              index === 5
                ? 'text-sky-700'
                : index === 6
                  ? 'text-rose-600'
                  : 'text-stone-500',
            )}
            key={label}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className="grid flex-1 grid-cols-7 gap-1"
        style={{
          gridTemplateRows: `repeat(${cells.length / 7}, minmax(5.5rem, 1fr))`,
        }}
      >
        {cells.map((date) => {
          const isCurrentMonth = date.getMonth() === cursor.getMonth()
          const isToday = isSameDay(date, today)
          const dayEvents = getEventsForDay(events, date)
          return (
            <div
              aria-label={`${formatCalendarDate(date)} 일정 ${dayEvents.length}개`}
              className={cx(
                'min-h-24 min-w-0 rounded-lg border border-stone-200 p-2 sm:min-h-0',
                isToday ? 'bg-brand-50' : 'bg-stone-50/60',
              )}
              key={date.toISOString()}
            >
              <span
                className={cx(
                  'flex size-7 items-center justify-center rounded-full type-body font-semibold',
                  isToday
                    ? 'bg-brand-600 font-bold text-white'
                    : getWeekendDateClassName(date, isCurrentMonth),
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 grid gap-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <CalendarEventButton
                    event={event}
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                  />
                ))}
                {dayEvents.length > 2 ? (
                  <span className="px-1 type-micro font-medium text-stone-400">
                    +{dayEvents.length - 2}개
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function WeekView({
  cursor,
  events,
  onSelectEvent,
  today,
}: {
  cursor: Date
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
  today: Date
}) {
  const week = getWeek(cursor)
  return (
    <section className="grid min-h-0 flex-1 gap-1 overflow-auto p-3 sm:p-4 md:grid-cols-7">
      {week.map((date, index) => {
        const dayEvents = getEventsForDay(events, date)
        return (
          <div
            aria-label={`${formatCalendarDate(date)} 일정 ${dayEvents.length}개`}
            className="min-h-48 min-w-0 rounded-lg border border-stone-200 bg-stone-50/60 p-3"
            key={date.toISOString()}
          >
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  'type-caption font-semibold',
                  index === 5
                    ? 'text-sky-700'
                    : index === 6
                      ? 'text-rose-600'
                      : 'text-stone-400',
                )}
              >
                {WEEKDAY_LABELS[index]}
              </span>
              <span
                className={cx(
                  'flex size-7 items-center justify-center rounded-full type-caption font-semibold',
                  isSameDay(date, today)
                    ? 'bg-brand-600 text-white'
                    : getWeekendDateClassName(date, true),
                )}
              >
                {date.getDate()}
              </span>
            </div>
            <div className="mt-3 grid gap-1.5">
              {dayEvents.map((event) => (
                <CalendarEventButton
                  event={event}
                  key={event.id}
                  onClick={() => onSelectEvent(event)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function ListView({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
}) {
  if (events.length > 0) {
    return (
      <section className="min-h-0 flex-1 overflow-auto">
        {events.map((event) => (
          <button
            className="flex min-h-16 w-full items-center gap-3 border-b border-stone-100 px-4 text-left last:border-b-0 hover:bg-stone-50"
            key={event.id}
            onClick={() => onSelectEvent(event)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cx('size-2 shrink-0 rounded-full', getEventDotClassName(event.kind))}
            />
            <span className="min-w-0 flex-1">
              <strong className="block truncate type-body font-semibold text-stone-900">
                {event.title}
              </strong>
              <span className="mt-0.5 block type-caption text-stone-400">
                {formatScheduleDate(event.startsAt)} ·{' '}
                {getCalendarEventKindLabel(event.kind)}
              </span>
            </span>
          </button>
        ))}
      </section>
    )
  }

  return (
    <section className="flex min-h-72 flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
        <CalendarDays aria-hidden="true" size={19} />
      </span>
      <h2 className="mt-4 type-section-title font-bold text-stone-900">
        예정된 일정이 없습니다
      </h2>
      <p className="mt-1.5 type-body text-stone-500">
        공지와 개인 일정이 등록되면 날짜순으로 표시됩니다.
      </p>
    </section>
  )
}

function MonthlySchedulePanel({
  events,
  onSelectEvent,
}: {
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
}) {
  return (
    <aside
      aria-label="이번 달 일정"
      className="min-h-0 rounded-lg border border-stone-200 bg-white p-4 lg:overflow-auto"
    >
      <h2 className="type-body font-bold text-stone-900">이번 달 일정</h2>
      {events.length > 0 ? (
        <div className="mt-4 grid gap-1">
          {events.map((event) => (
            <button
              aria-label={`${event.title}, ${formatScheduleDateTime(event.startsAt)}`}
              className="flex w-full items-start gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-stone-50"
              key={event.id}
              onClick={() => onSelectEvent(event)}
              type="button"
            >
              <span className="mt-0.5 shrink-0 rounded-md bg-stone-100 px-2 py-1 type-micro font-bold text-stone-500">
                {formatScheduleMonthDay(event.startsAt)}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate type-caption font-semibold text-stone-900">
                  {event.title}
                </strong>
                <span
                  className={cx(
                    'mt-1 block type-micro font-semibold',
                    event.kind === 'NOTICE' ? 'text-amber-700' : 'text-brand-700',
                  )}
                >
                  {getCalendarEventKindLabel(event.kind)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 type-caption text-stone-400">등록된 일정이 없습니다.</p>
      )}
    </aside>
  )
}

function CalendarEventButton({
  event,
  onClick,
}: {
  event: CalendarEvent
  onClick: () => void
}) {
  return (
    <button
      aria-label={`${event.title}, ${formatScheduleDateTime(event.startsAt)}`}
      className={cx(
        'h-6 min-w-0 truncate rounded px-1.5 text-left type-micro font-semibold',
        getEventChipClassName(event.kind),
      )}
      onClick={onClick}
      title={event.title}
      type="button"
    >
      {event.title}
    </button>
  )
}

function ScheduleComposer({
  initialEvent,
  initialDate,
  onClose,
  onSubmit,
}: {
  initialEvent?: CalendarEvent
  initialDate: Date
  onClose: () => void
  onSubmit: (input: CreateCalendarEventInput) => Promise<void>
}) {
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [startsAt, setStartsAt] = useState(() => initialEvent ? toDateTimeLocal(new Date(initialEvent.startsAt)) : toDateTimeLocal(initialDate))
  const [endsAt, setEndsAt] = useState(() => initialEvent ? toDateTimeLocal(new Date(initialEvent.endsAt)) : toDateTimeLocal(new Date(initialDate.getTime() + 60 * 60 * 1000)))
  const [hasDuration, setHasDuration] = useState(() => Boolean(initialEvent && initialEvent.endsAt !== initialEvent.startsAt))
  const [hasTime, setHasTime] = useState(initialEvent?.hasTime ?? true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const rangeError = hasDuration && startsAt && endsAt && endsAt < startsAt

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !startsAt) return
    if (rangeError) return
    const parsedDate = new Date(hasTime ? startsAt : `${startsAt}T00:00:00`)
    if (Number.isNaN(parsedDate.getTime())) return
    const parsedEnd = hasDuration
      ? new Date(hasTime ? endsAt : `${endsAt}T23:59:59`)
      : undefined
    setIsSubmitting(true)
    await onSubmit({
      endsAt: parsedEnd?.toISOString() ?? parsedDate.toISOString(),
      hasTime,
      startsAt: parsedDate.toISOString(),
      title: title.trim(),
    }).finally(() => setIsSubmitting(false))
  }

  return (
    <div
      aria-labelledby="schedule-composer-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4"
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-2xl"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="type-dialog-title font-bold text-stone-950" id="schedule-composer-title">
            {initialEvent ? '일정 수정' : '일정 추가'}
          </h2>
          <button
            aria-label="일정 추가 닫기"
            className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <label className="mt-5 block type-control font-semibold text-stone-800">
          일정 이름
          <input
            autoFocus
            className="mt-1 h-11 w-full rounded-lg border border-stone-300 bg-white px-3.5 type-body outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="일정 이름을 입력하세요"
            value={title}
          />
        </label>

        <div className="mt-4 flex items-center gap-5 rounded-lg bg-stone-50 px-3.5 py-3">
          <ToggleControl checked={hasDuration} label="기간" onChange={(checked) => { setHasDuration(checked); if (checked && endsAt < startsAt) setEndsAt(startsAt) }} />
          <ToggleControl checked={hasTime} label="시간" onChange={(checked) => { setHasTime(checked); setStartsAt((value) => checked ? `${value.slice(0, 10)}T09:00` : value.slice(0, 10)); setEndsAt((value) => checked ? `${value.slice(0, 10)}T10:00` : value.slice(0, 10)) }} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="type-control font-semibold text-stone-800">
            {hasDuration ? '시작' : '날짜'}{hasTime ? '와 시간' : ''}
            <input
              className="mt-1 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 type-body outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              onChange={(event) => setStartsAt(event.target.value)}
              type={hasTime ? 'datetime-local' : 'date'}
              value={startsAt}
            />
          </label>
          {hasDuration ? <label className="type-control font-semibold text-stone-800">종료{hasTime ? ' 날짜와 시간' : '일'}<input aria-invalid={Boolean(rangeError)} className={cx('mt-1 h-11 w-full rounded-lg border bg-white px-3 type-body outline-none focus:ring-2', rangeError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-stone-300 focus:border-brand-600 focus:ring-brand-100')} min={startsAt || undefined} onChange={(event) => setEndsAt(event.target.value)} type={hasTime ? 'datetime-local' : 'date'} value={endsAt} /></label> : null}
        </div>
        {rangeError ? <p className="mt-2 type-caption font-medium text-rose-600">종료 시각은 시작 시각보다 빠를 수 없습니다.</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            취소
          </Button>
          <Button disabled={!title.trim() || !startsAt || Boolean(rangeError) || isSubmitting} type="submit">
            {isSubmitting ? '저장 중' : initialEvent ? '변경 저장' : '추가'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function ToggleControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 type-caption font-semibold text-stone-700">
      <button
        aria-checked={checked}
        className={cx(
          'relative h-5 w-9 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          checked ? 'bg-brand-600' : 'bg-stone-300',
        )}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span className={cx('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')} />
      </button>
      {label}
    </label>
  )
}

function ScheduleDetailDialog({
  event,
  onClose,
  onEdit,
  onRemove,
}: {
  event: CalendarEvent
  onClose: () => void
  onEdit?: () => void
  onRemove?: () => Promise<void>
}) {
  return (
    <div
      aria-labelledby="schedule-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4"
      role="dialog"
    >
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="type-caption font-semibold text-stone-400">
              {getCalendarEventKindLabel(event.kind)}
            </p>
            <h2
              className="mt-1 break-words type-dialog-title font-bold text-stone-950"
              id="schedule-detail-title"
            >
              {event.title}
            </h2>
          </div>
          <button
            aria-label="일정 상세 닫기"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <p className="mt-4 rounded-lg bg-stone-50 px-3.5 py-3 type-body font-medium text-stone-700">
          {formatEventRange(event)}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {!onRemove ? (
            <p className="type-caption text-stone-400">강의실 일정은 주차 또는 공지에서 관리합니다.</p>
          ) : (
          <>
          {onEdit ? <Button onClick={onEdit} variant="secondary">일정 수정</Button> : null}
          <Button
            className="border-rose-700 bg-rose-700 hover:bg-rose-800"
            onClick={() => void onRemove()}
          >
            <Trash2 aria-hidden="true" size={14} />
            일정 삭제
          </Button>
          </>
          )}
        </div>
      </div>
    </div>
  )
}

function getEventsForDay(
  events: CalendarEvent[],
  date: Date,
): CalendarEvent[] {
  return events.filter((event) => isSameDay(new Date(event.startsAt), date))
}

function getWeekendDateClassName(
  date: Date,
  isCurrentPeriod: boolean,
): string {
  if (date.getDay() === 6) {
    return isCurrentPeriod ? 'text-sky-700' : 'text-sky-300'
  }
  if (date.getDay() === 0) {
    return isCurrentPeriod ? 'text-rose-600' : 'text-rose-300'
  }
  return isCurrentPeriod ? 'text-stone-800' : 'text-stone-300'
}

function getEventChipClassName(kind: CalendarEventKind): string {
  switch (kind) {
    case 'NOTICE':
      return 'bg-amber-50 text-amber-800 hover:bg-amber-100'
    case 'PERSONAL':
      return 'bg-brand-50 text-brand-800 hover:bg-brand-100'
  }
}

function getEventDotClassName(kind: CalendarEventKind): string {
  switch (kind) {
    case 'NOTICE':
      return 'bg-amber-500'
    case 'PERSONAL':
      return 'bg-brand-600'
  }
}

function getInitialScheduleDate(cursor: Date, today: Date): Date {
  if (
    cursor.getFullYear() === today.getFullYear() &&
    cursor.getMonth() === today.getMonth()
  ) {
    const nextHour = new Date()
    nextHour.setMinutes(0, 0, 0)
    nextHour.setHours(nextHour.getHours() + 1)
    return nextHour
  }
  return new Date(cursor.getFullYear(), cursor.getMonth(), 1, 9)
}

function toDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function formatCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(date)
}

function formatScheduleDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function formatScheduleDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
  }).format(new Date(iso))
}

function formatScheduleMonthDay(iso: string): string {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function eventIntersectsMonth(event: CalendarEvent, cursor: Date): boolean {
  const monthStart = startOfMonth(cursor)
  const nextMonthStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    1,
  )
  const eventStart = new Date(event.startsAt)
  const eventEnd = new Date(event.endsAt || event.startsAt)
  return eventStart < nextMonthStart && eventEnd >= monthStart
}

function formatEventRange(event: CalendarEvent): string {
  const start = new Date(event.startsAt)
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' })
  if (event.hasTime === false) {
    const startLabel = dateFormatter.format(start)
    return event.endsAt
      ? `${startLabel} - ${dateFormatter.format(new Date(event.endsAt))} · 종일`
      : `${startLabel} · 종일`
  }
  const startLabel = formatScheduleDateTime(event.startsAt)
  return event.endsAt
    ? `${startLabel} - ${formatScheduleDateTime(event.endsAt)}`
    : startLabel
}

function getMonthCells(cursor: Date): Date[] {
  const first = startOfMonth(cursor)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = addDays(first, -mondayOffset)
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate()
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  return Array.from({ length: cellCount }, (_, index) => addDays(start, index))
}

function getWeek(cursor: Date): Date[] {
  const offset = (cursor.getDay() + 6) % 7
  const monday = addDays(startOfDay(cursor), -offset)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
}
