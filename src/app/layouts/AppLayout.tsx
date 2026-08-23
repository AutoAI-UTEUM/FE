import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileCheck2,
  LayoutGrid,
  LogOut,
  NotebookPen,
  Settings,
  Trash2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { getRoleLabel, isInstructorRole, useAuth } from '../../features/auth'
import {
  CLASSROOMS_CHANGED_EVENT,
  createClassroomsRepository,
  JOIN_REQUESTS_CHANGED_EVENT,
  type Classroom,
} from '../../features/classrooms'
import {
  createNotificationsRepository,
  type AppNotification,
  type AppNotificationType,
} from '../../features/notifications'
import { cx } from '../../shared/lib/cx'
import { SERVICE_NAME } from '../../shared/config/brand'
import { formatDateTime } from '../../shared/lib/format'
import {
  classroomAnnouncementsPath,
  classroomDetailPath,
  materialViewerPath,
  routes,
} from '../routes'
import { SettingsContent } from '../pages/SettingsPage'

const learnerNavigation: Array<{
  icon: LucideIcon
  label: string
  to: string
}> = [
  { icon: LayoutGrid, label: '강의실', to: routes.classrooms },
  { icon: CalendarDays, label: '캘린더', to: routes.calendar },
  { icon: NotebookPen, label: '내 노트', to: routes.notes },
  { icon: ClipboardCheck, label: '복습 퀴즈', to: routes.reviewQuizzes },
  { icon: FileCheck2, label: '시험', to: routes.exams },
]

export function AppLayout() {
  const { apiRequest, logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isStudyWorkspace = /^\/sessions\/[^/]+\/?$/.test(location.pathname)
  const [sidebarPreference, setSidebarPreference] = useState<{
    isCollapsed: boolean
    pathname: string
  } | null>(null)
  const isCollapsed =
    sidebarPreference?.pathname === location.pathname
      ? sidebarPreference.isCollapsed
      : isStudyWorkspace
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  const mobileMenuContainerRef = useRef<HTMLDivElement | null>(null)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [pendingJoinRequestCount, setPendingJoinRequestCount] = useState(0)
  const [sidebarClassrooms, setSidebarClassrooms] = useState<Classroom[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true)
  const [notificationReloadKey, setNotificationReloadKey] = useState(0)
  const roleLabel = getRoleLabel(user?.role)
  const isInstructor = isInstructorRole(user?.role)
  const classroomsRepository = useMemo(
    () => createClassroomsRepository(apiRequest),
    [apiRequest],
  )
  const notificationsRepository = useMemo(
    () => createNotificationsRepository(apiRequest),
    [apiRequest],
  )
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.readAt,
  ).length
  const primaryNavigation = useMemo(() => isInstructor
    ? instructorNavigation
    : learnerNavigation, [isInstructor])

  useEffect(() => {
    document.documentElement.classList.toggle(
      'study-workspace-active',
      isStudyWorkspace,
    )
    return () => {
      document.documentElement.classList.remove('study-workspace-active')
    }
  }, [isStudyWorkspace])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      classroomsRepository
        .list()
        .then((items) => {
          if (!cancelled) {
            setSidebarClassrooms(
              isInstructor
                ? items.filter((item) => item.status === 'ACTIVE')
                : items,
            )
            setPendingJoinRequestCount(isInstructor
              ? items.reduce((sum, item) => sum + item.pendingRequestCount, 0)
              : 0)
          }
        })
        .catch(() => undefined)
    }

    refresh()
    window.addEventListener(CLASSROOMS_CHANGED_EVENT, refresh)
    window.addEventListener(JOIN_REQUESTS_CHANGED_EVENT, refresh)
    return () => {
      cancelled = true
      window.removeEventListener(CLASSROOMS_CHANGED_EVENT, refresh)
      window.removeEventListener(JOIN_REQUESTS_CHANGED_EVENT, refresh)
    }
  }, [classroomsRepository, isInstructor])

  useEffect(() => {
    if (!isMenuOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !menuContainerRef.current?.contains(target) &&
        !mobileMenuContainerRef.current?.contains(target)
      ) {
        setIsMenuOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isMenuOpen])

  useEffect(() => {
    if (!isNotificationsOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNotificationsOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isNotificationsOpen])

  useEffect(() => {
    const controller = new AbortController()
    notificationsRepository.list(controller.signal)
      .then((items) => {
        setNotifications(items)
        setNotificationsError(null)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setNotificationsError(
            requestError instanceof Error
              ? requestError.message
              : '알림을 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingNotifications(false)
      })
    return () => controller.abort()
  }, [notificationReloadKey, notificationsRepository])

  async function markAllNotificationsRead() {
    const unread = notifications.filter((notification) => !notification.readAt)
    if (unread.length === 0) return
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((notification) =>
      notification.readAt ? notification : { ...notification, readAt }))
    const results = await Promise.allSettled(
      unread.map((notification) => notificationsRepository.markRead(notification.id)),
    )
    if (results.some((result) => result.status === 'rejected')) {
      setNotificationReloadKey((key) => key + 1)
    }
  }

  function openNotification(notification: AppNotification) {
    setIsNotificationsOpen(false)
    if (!notification.readAt) {
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, readAt } : item))
      void notificationsRepository.markRead(notification.id).catch(() => {
        setNotificationReloadKey((key) => key + 1)
      })
    }
    navigate(getNotificationPath(notification))
  }

  async function deleteNotification(notificationId: string) {
    const previous = notifications
    setNotifications((current) => current.filter((item) => item.id !== notificationId))
    try {
      await notificationsRepository.delete(notificationId)
    } catch {
      setNotifications(previous)
      setNotificationsError('알림을 삭제하지 못했습니다.')
    }
  }

  async function handleLogout() {
    setIsMenuOpen(false)
    await logout()
    navigate(routes.login, { replace: true })
  }

  function openSettings() {
    setIsMenuOpen(false)
    setIsSettingsOpen(true)
  }

  const profileMenu = (
    <div
      className="w-full rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg dark:bg-stone-50"
      role="menu"
    >
      <div className="flex items-center gap-2.5 border-b border-stone-100 px-2.5 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-200 type-caption font-semibold text-stone-600">
          {user?.name?.slice(0, 1) ?? '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate type-control font-semibold text-stone-800">
            {user?.name}
          </p>
          <p className="truncate type-micro text-stone-400">
            {user?.email} · {roleLabel}
          </p>
        </div>
      </div>
      <button
        className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={openSettings}
        role="menuitem"
        type="button"
      >
        <Settings aria-hidden="true" size={15} />
        설정
      </button>
      <div className="mx-2 my-1 h-px bg-stone-100" />
      <button
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={() => void handleLogout()}
        role="menuitem"
        type="button"
      >
        <LogOut aria-hidden="true" size={15} />
        로그아웃
      </button>
    </div>
  )

  return (
    <div
      className={cx(
        'bg-[#F6F7F9] text-stone-900 dark:bg-[#1b1c20] lg:flex',
        isStudyWorkspace ? 'h-dvh overflow-hidden' : 'min-h-screen',
      )}
    >
      <aside
        className={cx(
          'relative z-40 flex border-b border-stone-200 bg-white px-4 py-3 dark:bg-[#222327] lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0 lg:py-4',
          isCollapsed ? 'lg:w-14 lg:px-2' : 'lg:w-52 lg:px-2.5',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 lg:block lg:flex-none">
          <div
            className={cx(
              'flex items-center justify-between gap-2',
              isCollapsed && 'lg:flex-col lg:gap-3',
            )}
          >
            <Link
              className={cx(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600',
                isCollapsed && 'lg:justify-center lg:px-0',
              )}
              to={routes.classrooms}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-brand-600 text-white">
                <BookOpenCheck aria-hidden="true" size={16} />
              </span>
              <span className={cx('type-section-title font-bold', isCollapsed && 'lg:hidden')}>
                {SERVICE_NAME}
              </span>
            </Link>
            <div
              className={cx(
                'flex items-center gap-1',
                isCollapsed && 'lg:flex-col',
              )}
            >
              <div className="relative" ref={notificationsRef}>
                <button
                  aria-expanded={isNotificationsOpen}
                  aria-haspopup="dialog"
                  aria-label={`알림 ${unreadNotificationCount}개`}
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  onClick={() => {
                    if (!isNotificationsOpen) {
                      setIsLoadingNotifications(true)
                      setNotificationReloadKey((key) => key + 1)
                    }
                    setIsNotificationsOpen((open) => !open)
                    setIsMenuOpen(false)
                  }}
                  title="알림"
                  type="button"
                >
                  <Bell aria-hidden="true" size={15} />
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 type-micro font-bold leading-4 text-white">
                      {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                    </span>
                  ) : null}
                </button>
                {isNotificationsOpen ? (
                  <NotificationPanel
                    error={notificationsError}
                    isCollapsed={isCollapsed}
                    isLoading={isLoadingNotifications}
                    notifications={notifications}
                    onDelete={(notificationId) => void deleteNotification(notificationId)}
                    onMarkRead={() => void markAllNotificationsRead()}
                    onOpen={openNotification}
                    onRetry={() => {
                      setIsLoadingNotifications(true)
                      setNotificationReloadKey((key) => key + 1)
                    }}
                  />
                ) : null}
              </div>
              <button
                aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                className="hidden size-7 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:flex"
                onClick={() =>
                  setSidebarPreference({
                    isCollapsed: !isCollapsed,
                    pathname: location.pathname,
                  })
                }
                title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                type="button"
              >
                {isCollapsed ? (
                  <ChevronsRight aria-hidden="true" size={15} />
                ) : (
                  <ChevronsLeft aria-hidden="true" size={15} />
                )}
              </button>
            </div>
          </div>

          <nav
            aria-label="주요 메뉴"
            className="order-2 mt-3 flex w-full gap-1 overflow-x-auto lg:mt-6 lg:ml-0 lg:w-auto lg:flex-col lg:gap-0.5"
          >
            {primaryNavigation.map((item) => (
              <div className="contents" key={item.label}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => {
                    const isEntranceRequestsPath = location.pathname.endsWith('/entrance-requests')
                    const isItemActive = item.to === routes.entranceRequests
                      ? isEntranceRequestsPath
                      : item.to === routes.classrooms
                        ? isActive && !isEntranceRequestsPath
                        : isActive
                    return navLinkClassName(isItemActive, isCollapsed)
                  }}
                  title={item.label}
                >
                  <item.icon aria-hidden="true" className="shrink-0" size={16} />
                  <span className={cx(isCollapsed && 'lg:sr-only')}>{item.label}</span>
                  {item.label === '입장 요청' && pendingJoinRequestCount > 0 ? (
                    <span
                      aria-label={`${pendingJoinRequestCount}개의 대기 요청`}
                      className={cx(
                        'ml-auto min-w-5 rounded-full bg-brand-600 px-1.5 text-center type-micro font-bold leading-5 text-white',
                        isCollapsed && 'lg:absolute lg:top-0 lg:right-0 lg:min-w-4 lg:px-1 lg:leading-4',
                      )}
                    >
                      {pendingJoinRequestCount > 99 ? '99+' : pendingJoinRequestCount}
                    </span>
                  ) : null}
                </NavLink>
                {item.label === '강의실' && sidebarClassrooms.length > 0 ? (
                  <div className={cx('ml-5 hidden border-l border-stone-200 py-1 pl-2 lg:flex lg:flex-col lg:gap-0.5', isCollapsed && 'lg:hidden')}>
                    {sidebarClassrooms.map((classroom) => (
                      <NavLink
                        className={({ isActive }) => cx(
                          'flex min-h-8 items-center gap-2 rounded-md px-2 type-caption font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800',
                          isActive && 'bg-brand-50 text-brand-700',
                        )}
                        key={classroom.id}
                        title={classroom.name}
                        to={classroomDetailPath(classroom.id)}
                      >
                        <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', classroomDotClassName(classroom.color))} />
                        <span className="truncate">{classroom.name}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
        </div>

        <div className="relative ml-2 shrink-0 lg:hidden" ref={mobileMenuContainerRef}>
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label="프로필 메뉴"
            className="flex size-9 items-center justify-center rounded-full bg-stone-200 type-caption font-semibold text-stone-600 hover:bg-stone-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            {user?.name?.slice(0, 1) ?? '?'}
          </button>
          {isMenuOpen ? (
            <div className="absolute top-[calc(100%+8px)] right-0 z-30 w-60 lg:hidden">
              {profileMenu}
            </div>
          ) : null}
        </div>

        <div
          className="relative hidden lg:mt-auto lg:flex lg:items-center lg:gap-1"
          ref={menuContainerRef}
        >
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label="프로필 메뉴"
            className={cx(
              'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border-t border-transparent p-1.5 text-left hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              isCollapsed && 'justify-center p-1',
            )}
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 type-micro font-semibold text-stone-600">
              {user?.name?.slice(0, 1) ?? '?'}
            </span>
            <span className={cx('min-w-0 flex-1', isCollapsed && 'lg:hidden')}>
              <span className="block truncate type-control font-semibold text-stone-800">
                {user?.name}
              </span>
              <span className="block truncate type-micro text-stone-400">
                {roleLabel}
              </span>
            </span>
          </button>
          {isMenuOpen ? (
            <div
              className={cx(
                'absolute z-30 hidden lg:block',
                isCollapsed
                  ? 'bottom-0 left-[calc(100%+8px)] w-60'
                  : 'bottom-[calc(100%+8px)] left-0 w-full',
              )}
            >
              {profileMenu}
            </div>
          ) : null}
        </div>
      </aside>

      <main
        className={cx(
          'min-w-0 flex-1',
          isStudyWorkspace
            ? 'h-[calc(100dvh-61px)] overflow-hidden p-0 lg:h-dvh'
            : 'px-4 py-4 sm:px-6 lg:px-12 lg:py-5',
        )}
      >
        <div
          className={
            isStudyWorkspace
              ? 'h-full min-h-0'
              : 'mx-auto w-full max-w-[1600px]'
          }
        >
          <Outlet />
        </div>
      </main>
      {isSettingsOpen ? <SettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}
    </div>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      aria-labelledby="settings-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <section className="min-h-[464px] w-full max-w-[600px] rounded-xl border border-stone-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="type-dialog-title font-bold text-stone-950" id="settings-dialog-title">
            설정
          </h2>
          <button
            aria-label="설정 닫기"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <SettingsContent />
      </section>
    </div>
  )
}

function NotificationPanel({
  error,
  isCollapsed,
  isLoading,
  notifications,
  onDelete,
  onMarkRead,
  onOpen,
  onRetry,
  placement = 'header',
}: {
  error: string | null
  isCollapsed: boolean
  isLoading: boolean
  notifications: AppNotification[]
  onDelete: (notificationId: string) => void
  onMarkRead: () => void
  onOpen: (notification: AppNotification) => void
  onRetry: () => void
  placement?: 'footer' | 'header'
}) {
  const hasUnreadNotifications = notifications.some(
    (notification) => !notification.readAt,
  )

  return (
    <div
      aria-label="알림"
      className={cx(
        'isolate absolute z-[60] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl ring-1 ring-stone-950/5 dark:bg-[#26272c]',
        placement === 'footer'
          ? 'right-0 bottom-[calc(100%+8px)]'
          : 'top-[calc(100%+8px)] right-0',
        placement === 'header' && (isCollapsed
          ? 'lg:top-0 lg:right-auto lg:left-[calc(100%+8px)]'
          : 'lg:right-auto lg:left-0'),
      )}
      role="dialog"
    >
      <div className="flex h-12 items-center justify-between border-b border-stone-100 px-4">
        <h2 className="type-body font-bold text-stone-900">알림</h2>
        <button
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 type-micro font-semibold text-stone-500 hover:bg-stone-50 hover:text-stone-800 disabled:cursor-default disabled:opacity-40"
          disabled={isLoading || !hasUnreadNotifications}
          onClick={onMarkRead}
          type="button"
        >
          <Check aria-hidden="true" size={12} />
          모두 읽음
        </button>
      </div>
      {isLoading && notifications.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center px-5 text-center">
          <p className="type-body text-stone-500" role="status">알림을 불러오는 중입니다.</p>
        </div>
      ) : error && notifications.length === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="type-body font-medium text-rose-700" role="alert">{error}</p>
          <button
            className="type-control font-semibold text-brand-700 hover:text-brand-900"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        </div>
      ) : notifications.length > 0 ? (
        <div className="max-h-80 overflow-y-auto py-1.5">
          {error ? (
            <p className="px-4 py-2 type-micro font-medium text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {notifications.map((notification) => (
            <div
              className={cx(
                'group flex min-h-20 items-start gap-3 px-4 py-3 hover:bg-stone-50',
                !notification.readAt && 'bg-brand-50/40',
              )}
              key={notification.id}
            >
              <button
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                onClick={() => onOpen(notification)}
                type="button"
              >
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <NotificationIcon type={notification.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <strong className="block min-w-0 flex-1 truncate type-control font-semibold text-stone-900">
                      {notification.title}
                    </strong>
                    {!notification.readAt ? (
                      <span aria-label="읽지 않음" className="size-1.5 shrink-0 rounded-full bg-brand-600" />
                    ) : null}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block type-caption text-stone-500">
                    {notification.body}
                  </span>
                  <span className="mt-1 block type-micro text-stone-400">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </span>
              </button>
              <button
                aria-label={`${notification.title} 알림 삭제`}
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-stone-400 opacity-0 hover:bg-stone-100 hover:text-stone-700 focus:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 group-hover:opacity-100"
                onClick={() => onDelete(notification.id)}
                title="알림 삭제"
                type="button"
              >
                <Trash2 aria-hidden="true" size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-32 flex-col items-center justify-center px-5 text-center">
          <Bell aria-hidden="true" className="text-stone-300" size={20} />
          <p className="mt-2 type-body font-semibold text-stone-700">
            새로운 알림이 없습니다
          </p>
        </div>
      )}
    </div>
  )
}

function NotificationIcon({ type }: { type: AppNotificationType }) {
  switch (type) {
    case 'MATERIAL_UPLOADED':
      return <BookOpenCheck aria-hidden="true" size={14} />
    case 'NOTICE_PUBLISHED':
      return <Bell aria-hidden="true" size={14} />
    case 'JOIN_REQUEST_RECEIVED':
    case 'JOIN_REQUEST_PROCESSED':
      return <UserPlus aria-hidden="true" size={14} />
  }
}

function getNotificationPath(notification: AppNotification): string {
  const { classroomId, materialId } = notification.link
  switch (notification.type) {
    case 'MATERIAL_UPLOADED':
      return materialId
        ? materialViewerPath(materialId)
        : classroomId
          ? classroomDetailPath(classroomId)
          : routes.classrooms
    case 'NOTICE_PUBLISHED':
      return classroomId
        ? classroomAnnouncementsPath(classroomId)
        : routes.classrooms
    case 'JOIN_REQUEST_RECEIVED':
      return routes.entranceRequests
    case 'JOIN_REQUEST_PROCESSED':
      return routes.classrooms
  }
}

function navLinkClassName(isActive: boolean, isCollapsed: boolean): string {
  return cx(
    'relative inline-flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 type-control',
    isCollapsed && 'lg:w-9 lg:justify-center lg:px-0',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
    isActive
      ? 'bg-brand-50 font-semibold text-brand-700 shadow-sm'
      : 'font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800',
  )
}

const instructorNavigation: Array<{ icon: LucideIcon; label: string; to: string }> = [
  { icon: LayoutGrid, label: '강의실', to: routes.classrooms },
  { icon: CalendarDays, label: '캘린더', to: routes.calendar },
  { icon: UserPlus, label: '입장 요청', to: routes.entranceRequests },
]

function classroomDotClassName(_color: Classroom['color']): string {
  void _color
  return 'bg-brand-700'
}
