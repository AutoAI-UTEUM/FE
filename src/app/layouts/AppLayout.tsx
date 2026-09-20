import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  CircleUserRound,
  ClipboardCheck,
  FileCheck2,
  LayoutGrid,
  List,
  LogOut,
  MessageSquareText,
  NotebookPen,
  PanelLeft,
  ServerCog,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { getRoleLabel, isAdminRole, isInstructorRole, useAuth } from '../../features/auth'
import {
  CLASSROOMS_CHANGED_EVENT,
  createClassroomsRepository,
  JOIN_REQUESTS_CHANGED_EVENT,
} from '../../features/classrooms'
import {
  createNotificationsRepository,
  type AppNotification,
  type AppNotificationType,
} from '../../features/notifications'
import { cx } from '../../shared/lib/cx'
import { useResponsiveViewport, useFocusScope } from '../../shared/responsive'
import { SERVICE_NAME } from '../../shared/config/brand'
import { formatDateTime } from '../../shared/lib/format'
import {
  classroomAnnouncementsPath,
  classroomDetailPath,
  examDetailPath,
  materialViewerPath,
  routes,
} from '../routes'
import { SettingsContent } from '../pages/SettingsPage'

/*
 * `inBottomNav`는 모바일 하단 바에 우선 노출할 메뉴를 고른다.
 * 하단 바는 최우측 프로필까지 네 칸이므로 내비는 3개까지만 올리고,
 * 나머지는 프로필 메뉴 위쪽에 모은다.
 */
interface NavigationItem {
  icon: LucideIcon
  inBottomNav?: boolean
  label: string
  to: string
}

const learnerNavigation: NavigationItem[] = [
  { icon: LayoutGrid, inBottomNav: true, label: '강의실', to: routes.classrooms },
  { icon: CalendarDays, label: '캘린더', to: routes.calendar },
  { icon: NotebookPen, inBottomNav: true, label: '내 노트', to: routes.notes },
  { icon: ClipboardCheck, inBottomNav: true, label: '복습 퀴즈', to: routes.reviewQuizzes },
  { icon: FileCheck2, label: '시험', to: routes.exams },
]

const BOTTOM_NAV_WIDE_MIN_WIDTH = 420

export function AppLayout() {
  const { apiRequest, logout, rawApiRequest, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { isMobileWeb, isPhone, isTablet, mode, viewportWidth } = useResponsiveViewport()
  /* 태블릿 세로는 하단 내비, 가로는 공간에 따라 레일 또는 사이드바를 쓴다. */
  const [tabletMenuPath, setTabletMenuPath] = useState<string | null>(null)
  const tabletMenuOpen = tabletMenuPath === `${location.pathname}${location.search}`
  const isTabletPortrait = mode === 'tablet-portrait'
  const tabletUsesRail = mode === 'tablet-landscape' && viewportWidth < 1024
  const isTabletRail = tabletUsesRail && !tabletMenuOpen
  const tabletNavigationRef = useRef<HTMLElement>(null)
  useFocusScope(tabletNavigationRef, tabletUsesRail && tabletMenuOpen, () => setTabletMenuPath(null))
  const isProfileRoute =
    location.pathname === routes.feedback ||
    location.pathname === routes.settings ||
    location.pathname === routes.updates
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
  const bottomMenuContainerRef = useRef<HTMLElement | null>(null)
  const primaryNavigationRef = useRef<HTMLElement | null>(null)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [pendingJoinRequestCount, setPendingJoinRequestCount] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true)
  const [notificationReloadKey, setNotificationReloadKey] = useState(0)
  const [loadedProfileAvatar, setLoadedProfileAvatar] = useState<{
    source: string
    url: string
  } | null>(null)
  const roleLabel = getRoleLabel(user?.role)
  const isAdmin = isAdminRole(user?.role)
  const isInstructor = isInstructorRole(user?.role)
  const activeAdminTab = adminTabFromLocation(`${location.pathname}${location.search}`)
  const isAdminFixedHeightWorkspace = isAdmin
    && location.pathname === routes.admin
    && (activeAdminTab === 'ai-usage' || activeAdminTab === 'updates')
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
  const primaryNavigation = useMemo(() => isAdmin
    ? adminNavigation
    : isInstructor
      ? instructorNavigation
      : learnerNavigation, [isAdmin, isInstructor])
  const homeRoute = isAdmin ? routes.admin : routes.classrooms
  const bottomNavigationLimit = viewportWidth < BOTTOM_NAV_WIDE_MIN_WIDTH ? 2 : 3
  const bottomNavigation = primaryNavigation
    .filter((item) => item.inBottomNav)
    .slice(0, bottomNavigationLimit)
  const overflowNavigation = primaryNavigation.filter(
    (item) => !bottomNavigation.includes(item),
  )
  const usesBottomNavigationLayout = isPhone || isTabletPortrait
  const hasBottomNav = usesBottomNavigationLayout && !isStudyWorkspace
  const hasActiveOverflowNavigation = overflowNavigation.some((item) =>
    isNavigationItemActive(item, location.pathname, location.search, isAdmin),
  )
  const avatarSource = user?.avatarUrl
  const isDirectAvatarSource = avatarSource?.startsWith('blob:')
    || avatarSource?.startsWith('data:')
  const profileAvatarUrl = !avatarSource
    ? null
    : isDirectAvatarSource
      ? avatarSource
      : loadedProfileAvatar?.source === avatarSource
        ? loadedProfileAvatar.url
        : null

  useEffect(() => {
    if (!isMobileWeb) return
    const activeItem = primaryNavigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    activeItem?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [isMobileWeb, location.pathname, location.search])

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
    if (!avatarSource || isDirectAvatarSource) return

    const controller = new AbortController()
    let objectUrl: string | null = null
    rawApiRequest('/api/users/me/avatar', { signal: controller.signal })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setLoadedProfileAvatar({ source: avatarSource, url: objectUrl })
      })
      .catch(() => undefined)

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [avatarSource, isDirectAvatarSource, rawApiRequest])

  useEffect(() => {
    if (!isInstructor) {
      return
    }

    let cancelled = false
    const refresh = () => {
      classroomsRepository
        .list()
        .then((items) => {
          if (!cancelled) {
            setPendingJoinRequestCount(
              items.reduce((sum, item) => sum + item.pendingRequestCount, 0),
            )
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
        !mobileMenuContainerRef.current?.contains(target) &&
        !bottomMenuContainerRef.current?.contains(target)
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
      const target = event.target as Node
      if (
        !notificationsRef.current?.contains(target)
        && !bottomMenuContainerRef.current?.contains(target)
      ) {
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
    if (isAdmin) return

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
  }, [isAdmin, notificationReloadKey, notificationsRepository])

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
    setIsNotificationsOpen(false)
    if (isTabletPortrait) {
      navigate(routes.settings)
      return
    }
    setIsSettingsOpen(true)
  }

  /* 시안대로 알림은 태블릿에서 내비 항목 자리에 선다. 세로는 아이콘만, 가로는 라벨까지. */
  const notificationsTrigger = (
    <div className={cx('relative', isTablet && !isTabletRail && 'w-full')} ref={notificationsRef}>
      <button
        aria-expanded={isNotificationsOpen}
        aria-haspopup="dialog"
        aria-label={`알림 ${unreadNotificationCount}개`}
        className={cx(
          'relative flex shrink-0 items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          isTablet
            ? isTabletRail
              ? 'size-12 justify-center'
              : 'h-11 w-full gap-2.5 px-3 type-control font-medium'
            : 'size-7 justify-center mobile-web:size-11',
        )}
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
        <Bell aria-hidden="true" className="shrink-0" size={isTablet && !isTabletRail ? 16 : 15} />
        {isTablet && !isTabletRail ? <span>알림</span> : null}
        {unreadNotificationCount > 0 ? (
          <span
            className={cx(
              'flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 type-micro font-bold leading-4 text-white',
              isTablet && !isTabletRail ? 'ml-auto' : 'absolute -top-1 -right-1',
            )}
          >
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
  )

  const profileMenu = (
    <div
      className="w-full rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg dark:bg-stone-50"
      role="menu"
    >
      {hasBottomNav ? (
        <div className="border-b border-stone-100 px-2.5 py-2.5">
          <p className="truncate type-control font-semibold text-stone-900">{user?.name}</p>
          <p className="mt-0.5 type-micro text-stone-400">{roleLabel}</p>
        </div>
      ) : null}
      {/* 하단 바 네 칸에 자리가 없어 빠진 메뉴. 레일·사이드바가 보이는 곳에서는 중복이다. */}
      {hasBottomNav && overflowNavigation.length > 0 ? (
        <>
          {overflowNavigation.map((item) => {
            const active = isNavigationItemActive(
              item,
              location.pathname,
              location.search,
              isAdmin,
            )

            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  active && 'bg-brand-50 font-semibold text-brand-700',
                )}
                key={item.label}
                onClick={() => {
                  setIsMenuOpen(false)
                  setIsNotificationsOpen(false)
                }}
                role="menuitem"
                to={item.to}
              >
                <item.icon aria-hidden="true" size={15} />
                {item.label}
                {item.label === '입장 요청' && pendingJoinRequestCount > 0 ? (
                  <span className="ml-auto min-w-5 rounded-full bg-brand-600 px-1.5 text-center type-micro font-bold leading-5 text-white">
                    {pendingJoinRequestCount > 99 ? '99+' : pendingJoinRequestCount}
                  </span>
                ) : null}
              </Link>
            )
          })}
          <div className="mx-2 my-1 h-px bg-stone-100" />
        </>
      ) : null}
      {isTabletPortrait && !isAdmin ? (
        <button
          className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          onClick={() => {
            setIsMenuOpen(false)
            setIsLoadingNotifications(true)
            setNotificationReloadKey((key) => key + 1)
            setIsNotificationsOpen(true)
          }}
          role="menuitem"
          type="button"
        >
          <Bell aria-hidden="true" size={15} />
          알림
          {unreadNotificationCount > 0 ? (
            <span className="ml-auto min-w-5 rounded-full bg-brand-600 px-1.5 text-center type-micro font-bold leading-5 text-white">
              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
            </span>
          ) : null}
        </button>
      ) : null}
      <Link
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={() => {
          setIsMenuOpen(false)
          setIsNotificationsOpen(false)
        }}
        role="menuitem"
        to={routes.updates}
      >
        <CalendarDays aria-hidden="true" size={15} />
        업데이트
      </Link>
      <Link
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={() => {
          setIsMenuOpen(false)
          setIsNotificationsOpen(false)
        }}
        role="menuitem"
        to={routes.feedback}
      >
        <MessageSquareText aria-hidden="true" size={15} />
        피드백
      </Link>
      <button
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={openSettings}
        role="menuitem"
        type="button"
      >
        <Settings aria-hidden="true" size={15} />
        설정
      </button>
      <div className="mx-2 my-1 h-px bg-stone-100" />
      <button
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 type-control font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
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
      data-tablet-app={isTablet ? 'true' : undefined}
      data-study-workspace={isStudyWorkspace ? 'true' : undefined}
      className={cx(
        'bg-[#F6F7F9] text-stone-900 dark:bg-[#1b1c20] lg:flex mobile-web:max-w-full mobile-web:overflow-x-hidden',
        /*
         * 폰과 태블릿 세로는 본문·하단 바가 세로로 쌓이고, 태블릿 가로는 레일이 옆에 선다.
         * 루트가 실제로 flex여야 main이 남은 높이를 받아 매직 넘버 없이 화면을 채운다.
         */
        isStudyWorkspace
          ? cx(
              'h-dvh overflow-hidden',
              usesBottomNavigationLayout && 'flex flex-col',
              isTablet && !isTabletPortrait && 'flex flex-row',
            )
          : isAdminFixedHeightWorkspace
            ? cx(
                'flex h-dvh overflow-hidden',
                isTabletPortrait
                  ? 'flex-col'
                  : isTablet
                    ? 'flex-row'
                    : 'flex-col lg:flex-row',
              )
            : cx(
                'min-h-dvh',
                usesBottomNavigationLayout && 'flex flex-col',
                isTablet && !isTabletPortrait && 'flex flex-row',
              ),
      )}
    >
      {tabletUsesRail && tabletMenuOpen ? <><button aria-label="주요 메뉴 닫기" className="fixed inset-0 z-40 bg-stone-950/35" onClick={() => setTabletMenuPath(null)} type="button" /><div aria-hidden="true" className="w-[68px] shrink-0" /></> : null}
      <aside
        ref={tabletNavigationRef}
        role={tabletUsesRail && tabletMenuOpen ? 'dialog' : undefined}
        aria-modal={tabletUsesRail && tabletMenuOpen ? true : undefined}
        aria-label={tabletUsesRail && tabletMenuOpen ? '주요 메뉴' : undefined}
        className={cx(
          isTablet
            // 태블릿은 가로 스크롤 띠 대신 72px 세로 레일을 쓴다.
            ? cx(
                'sticky top-0 z-40 flex h-dvh shrink-0 flex-col border-r border-stone-200 bg-white py-4 dark:bg-[#222327] mobile-safe-top',
                isTabletRail ? 'w-[68px] px-2' : 'w-[240px] px-2.5',
                tabletUsesRail && tabletMenuOpen && '!fixed inset-y-0 left-0 !z-50 shadow-xl',
              )
            : 'relative z-40 flex border-b border-stone-200 bg-white px-4 py-3 dark:bg-[#222327] lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0 lg:py-4 mobile-phone:sticky mobile-phone:top-0 mobile-phone:!h-auto mobile-phone:!w-full mobile-phone:!flex-row mobile-phone:!border-r-0 mobile-phone:!border-b mobile-phone:!py-3 mobile-phone:mobile-safe-x mobile-phone:mobile-safe-top mobile-phone:shadow-sm',
          isTabletPortrait && 'hidden',
          !isTablet && (isCollapsed ? 'lg:w-14 lg:px-2 mobile-phone:!px-4' : 'lg:w-60 lg:px-2.5 mobile-phone:!px-4'),
          isAdminFixedHeightWorkspace && 'shrink-0',
        )}
      >
        <div
          className={cx(
            isTablet
              ? 'flex min-w-0 flex-none flex-col'
              : 'flex min-w-0 flex-1 flex-wrap items-center gap-x-4 lg:block lg:flex-none mobile-phone:!flex mobile-phone:!flex-1 mobile-phone:!items-center',
          )}
        >
          <div
            className={cx(
              'flex items-center justify-between gap-2',
              isTabletRail && 'flex-col gap-3',
              !isTablet && isCollapsed && 'lg:flex-col lg:gap-3 mobile-phone:!flex-row mobile-phone:!gap-2',
            )}
          >
            <Link
              aria-label={`${SERVICE_NAME} 홈`}
              className={cx(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600',
                isTabletRail && 'justify-center !px-0',
                !isTablet && isCollapsed && 'lg:justify-center lg:!px-0',
              )}
              to={homeRoute}
            >
              {isTabletRail || (!isTablet && isCollapsed && !isMobileWeb) ? (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-brand-600 text-white">
                  <BookOpenCheck aria-hidden="true" size={16} />
                </span>
              ) : null}
              <span
                className={cx(
                  'type-brand-title font-bold',
                  isTabletRail && 'hidden',
                  !isTablet && isCollapsed && !isMobileWeb && 'lg:hidden',
                )}
              >
                {SERVICE_NAME}
              </span>
            </Link>
            <div
              className={cx(
                'flex items-center gap-1',
                isTabletRail && 'flex-col',
                !isTablet && isCollapsed && 'lg:flex-col mobile-phone:!flex-row',
              )}
            >
              {!isAdmin && !isTablet ? notificationsTrigger : null}
              {tabletUsesRail ? <button aria-expanded={tabletMenuOpen} aria-label={tabletMenuOpen ? '메뉴 접기' : '메뉴 펼치기'} className="flex size-11 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100" onClick={(event) => { event.currentTarget.focus(); setTabletMenuPath(tabletMenuOpen ? null : `${location.pathname}${location.search}`) }} type="button">{tabletMenuOpen ? <ChevronsLeft aria-hidden="true" size={18} /> : <ChevronsRight aria-hidden="true" size={18} />}</button> : null}
              <button
                aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                className="hidden size-7 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:flex mobile-web:!hidden"
                onClick={() =>
                  setSidebarPreference({
                    isCollapsed: !isCollapsed,
                    pathname: location.pathname,
                  })
                }
                title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                type="button"
              >
                <PanelLeft aria-hidden="true" size={16} />
              </button>
            </div>
          </div>

          <nav
            aria-label="주요 메뉴"
            className={cx(
              isTablet
                ? cx('mt-6 flex flex-col gap-0.5', isTabletRail ? 'w-auto items-center' : 'w-full items-stretch')
                : 'mobile-horizontal-scroll order-2 mt-3 flex w-full gap-1 overflow-x-auto lg:mt-6 lg:ml-0 lg:w-auto lg:flex-col lg:gap-0.5 mobile-phone:!mt-3 mobile-phone:!w-full mobile-phone:!flex-row mobile-phone:!gap-1 mobile-phone:scroll-px-3',
              // 폰은 하단 탭 바가 대신하므로 상단 내비를 띄우지 않는다.
              isPhone && 'hidden',
            )}
            ref={primaryNavigationRef}
          >
            {primaryNavigation.map((item) => {
              const itemPath = item.to.split('?')[0]
              const isEntranceRequestsPath = location.pathname.endsWith('/entrance-requests')
              const isPathActive = location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`)
              const isItemActive = isAdmin && item.to.startsWith(routes.admin)
                ? adminTabFromLocation(item.to) === adminTabFromLocation(`${location.pathname}${location.search}`)
                : item.to === routes.entranceRequests
                  ? isEntranceRequestsPath
                  : item.to === routes.classrooms
                    ? isPathActive && !isEntranceRequestsPath
                    : isPathActive

              return (
              <div className="contents" key={item.label}>
                <Link
                  aria-current={isItemActive ? 'page' : undefined}
                  className={navLinkClassName(isItemActive, isCollapsed && !isMobileWeb, isTabletRail)}
                  to={item.to}
                  title={item.label}
                >
                  <item.icon aria-hidden="true" className="shrink-0" size={16} />
                  <span
                    className={cx(
                      isTabletRail && 'sr-only',
                      isCollapsed && !isMobileWeb && 'lg:sr-only',
                    )}
                  >
                    {item.label}
                  </span>
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
                </Link>
              </div>
              )
            })}
            {isTablet && !isAdmin ? notificationsTrigger : null}
          </nav>
        </div>

        {/* 폰에서는 프로필이 하단 바 최우측으로 내려가므로 상단에서는 감춘다. */}
        <div
          className={cx(
            'relative ml-2 shrink-0 lg:hidden mobile-web:!block',
            isTablet && cx('mt-auto ml-0 flex', isTabletRail ? 'justify-center' : 'w-full'),
            hasBottomNav && '!hidden',
          )}
          ref={mobileMenuContainerRef}
        >
          {isTablet ? (
            /* 태블릿에서는 프로필이 드롭다운이 아니라 설정 페이지 진입점이다. */
            <Link
              aria-current={isProfileRoute ? 'page' : undefined}
              className={cx(
                'flex items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                isTabletRail
                  ? 'size-12 justify-center'
                  : 'w-full gap-2.5 p-1.5 text-left',
                isProfileRoute
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800',
              )}
              title="설정"
              to={routes.settings}
            >
              <ProfileAvatar avatarUrl={profileAvatarUrl} className="size-9 type-caption" name={user?.name} />
              <span className={cx('min-w-0 flex-1', isTabletRail && 'sr-only')}>
                <span className="block truncate type-control font-semibold text-stone-800">
                  {user?.name}
                </span>
                <span className="block truncate type-micro text-stone-400">
                  {roleLabel}
                </span>
              </span>
            </Link>
          ) : (
            <>
              <button
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label="프로필 메뉴"
                className="flex size-9 items-center justify-center rounded-full bg-stone-200 type-caption font-semibold text-stone-600 hover:bg-stone-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 mobile-web:size-11"
                onClick={() => setIsMenuOpen((open) => !open)}
                type="button"
              >
                <ProfileAvatar avatarUrl={profileAvatarUrl} className="size-9 type-caption" name={user?.name} />
              </button>
              {isMenuOpen ? (
                <div className="absolute top-[calc(100%+8px)] right-0 z-30 w-60 lg:hidden">
                  {profileMenu}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div
          className="relative hidden lg:mt-auto lg:flex lg:items-center lg:gap-1 mobile-web:!hidden"
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
            <ProfileAvatar avatarUrl={profileAvatarUrl} className="size-7 type-micro" name={user?.name} />
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

      {/*
       * 상단 바 높이를 빼는 계산식 대신 flex로 남은 높이를 받는다.
       * 상단 바가 한 줄이든 두 줄이든, 세이프에어리어가 얼마든 아래가 잘리지 않는다.
       */}
      <main
        className={cx(
          'flex min-w-0 flex-1 flex-col',
          isStudyWorkspace
            ? 'min-h-0 overflow-hidden p-0'
            : cx(
                'px-4 py-4 sm:px-6 lg:py-5 mobile-phone:px-3',
                isMobileWeb && !hasBottomNav && 'mobile-safe-bottom',
                isAdmin ? 'lg:px-8' : 'lg:px-12',
                isAdminFixedHeightWorkspace && 'min-h-0 overflow-hidden',
              ),
          hasBottomNav && '!pb-[calc(4.25rem+env(safe-area-inset-bottom))]',
        )}
      >
        <div
          className={
            isStudyWorkspace
              ? 'min-h-0 flex-1'
              : isAdminFixedHeightWorkspace
                ? 'h-full min-h-0 w-full min-w-0'
              : isAdmin
                ? 'w-full min-w-0'
                : 'app-page-frame'
          }
        >
          <Outlet />
        </div>
      </main>

      {/* 모바일 하단 탭. 폭에 따라 내비 2~3개 + 최우측 프로필로 세 칸 또는 네 칸을 쓴다. */}
      {hasBottomNav ? (
        <nav
          aria-label="하단 주요 메뉴"
          className={cx(
            'fixed inset-x-0 bottom-0 z-40 flex shrink-0 border-t border-stone-200 bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.06)] dark:bg-[#222327]',
            isTabletPortrait
              ? 'min-h-[calc(4.25rem+env(safe-area-inset-bottom))] items-center pb-[env(safe-area-inset-bottom)]'
              : 'mobile-safe-bottom',
          )}
          ref={bottomMenuContainerRef}
        >
          {bottomNavigation.map((item) => {
            const isItemActive = isNavigationItemActive(
              item,
              location.pathname,
              location.search,
              isAdmin,
            )

            return (
              <Link
                aria-current={isItemActive ? 'page' : undefined}
                className={bottomNavLinkClassName(isItemActive)}
                key={item.label}
                onClick={() => {
                  setIsMenuOpen(false)
                  setIsNotificationsOpen(false)
                }}
                to={item.to}
              >
                <item.icon aria-hidden="true" size={20} />
                <span>{item.label}</span>
                {item.label === '입장 요청' && pendingJoinRequestCount > 0 ? (
                  <span
                    aria-label={`${pendingJoinRequestCount}개의 대기 요청`}
                    className="absolute top-1.5 right-[calc(50%-1.25rem)] min-w-4 rounded-full bg-brand-600 px-1 text-center type-micro font-bold leading-4 text-white"
                  >
                    {pendingJoinRequestCount > 99 ? '99+' : pendingJoinRequestCount}
                  </span>
                ) : null}
              </Link>
            )
          })}
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label="프로필 메뉴"
            className={bottomNavLinkClassName(
              isMenuOpen || hasActiveOverflowNavigation || isProfileRoute,
            )}
            onClick={() => {
              setIsNotificationsOpen(false)
              setIsMenuOpen((open) => !open)
            }}
            type="button"
          >
            <ProfileAvatar
              avatarUrl={profileAvatarUrl}
              className="size-5 type-compact-action"
              name={user?.name}
            />
            <span>프로필</span>
          </button>
          {/* 메뉴는 sticky한 nav를 기준으로 위쪽으로 펼쳐진다. */}
          {isMenuOpen ? (
            <div className="absolute right-2 bottom-[calc(100%+8px)] z-30 w-60">
              {profileMenu}
            </div>
          ) : null}
          {isTabletPortrait && !isAdmin && isNotificationsOpen ? (
            <NotificationPanel
              error={notificationsError}
              isCollapsed={false}
              isLoading={isLoadingNotifications}
              notifications={notifications}
              onDelete={(notificationId) => void deleteNotification(notificationId)}
              onMarkRead={() => void markAllNotificationsRead()}
              onOpen={openNotification}
              onRetry={() => {
                setIsLoadingNotifications(true)
                setNotificationReloadKey((key) => key + 1)
              }}
              placement="footer"
            />
          ) : null}
        </nav>
      ) : null}
      {isSettingsOpen ? <SettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}
    </div>
  )
}

function ProfileAvatar({
  avatarUrl,
  className,
  name,
}: {
  avatarUrl: string | null
  className: string
  name?: string
}) {
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 font-semibold text-stone-600',
        className,
      )}
    >
      {avatarUrl ? (
        <img alt="" className="size-full object-cover" src={avatarUrl} />
      ) : (
        name?.slice(0, 1) ?? '?'
      )}
    </span>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      aria-labelledby="settings-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 mobile-phone:p-0"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <section className="flex h-[min(520px,calc(100dvh-3rem))] min-h-0 w-full max-w-[560px] flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-2xl sm:p-6 mobile-phone:h-[100dvh] mobile-phone:max-w-none mobile-phone:rounded-none mobile-phone:border-0 mobile-phone:mobile-safe-x mobile-phone:mobile-safe-top mobile-phone:mobile-safe-bottom">
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
        <SettingsContent className="min-h-0 flex-1" />
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
    case 'EXAM_PUBLISHED':
    case 'EXAM_DEADLINE_APPROACHING':
    case 'EXAM_GRADED':
      return <FileCheck2 aria-hidden="true" size={14} />
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
  const { classroomId, examId, materialId } = notification.link
  switch (notification.type) {
    case 'EXAM_PUBLISHED':
    case 'EXAM_DEADLINE_APPROACHING':
    case 'EXAM_GRADED':
      return examId ? examDetailPath(examId, classroomId) : routes.exams
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

function navLinkClassName(isActive: boolean, isCollapsed: boolean, isRail = false): string {
  return cx(
    isRail
      // 태블릿 레일은 아이콘 위·라벨 아래 52px 정사각.
      // 세로 레일은 라벨 없이 아이콘만. 48px 정사각이면 68px 레일 안에 여백이 남는다.
      ? 'relative inline-flex size-12 shrink-0 items-center justify-center rounded-lg'
      : 'relative inline-flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 type-navigation mobile-web:h-11',
    !isRail && isCollapsed && 'lg:w-9 lg:justify-center lg:px-0',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
    isActive
      ? 'bg-brand-50 font-semibold text-brand-800'
      : 'font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800',
  )
}

function isNavigationItemActive(
  item: NavigationItem,
  pathname: string,
  search: string,
  isAdmin: boolean,
): boolean {
  const itemPath = item.to.split('?')[0]
  const isEntranceRequestsPath = pathname.endsWith('/entrance-requests')
  const isPathActive = pathname === itemPath || pathname.startsWith(`${itemPath}/`)

  if (isAdmin && item.to.startsWith(routes.admin)) {
    return adminTabFromLocation(item.to) === adminTabFromLocation(`${pathname}${search}`)
  }
  if (item.to === routes.entranceRequests) return isEntranceRequestsPath
  if (item.to === routes.classrooms) return isPathActive && !isEntranceRequestsPath
  return isPathActive
}

const instructorNavigation: NavigationItem[] = [
  { icon: LayoutGrid, inBottomNav: true, label: '강의실', to: routes.classrooms },
  { icon: CalendarDays, inBottomNav: true, label: '캘린더', to: routes.calendar },
  { icon: UserPlus, inBottomNav: true, label: '입장 요청', to: routes.entranceRequests },
]

/* 폰 하단 탭. 52px 높이로 44px 최소 터치 영역을 넘기고, 네 칸이 정확히 같은 폭으로 나뉜다. */
function bottomNavLinkClassName(isActive: boolean): string {
  return cx(
    // h-13: index.css의 전역 min-height:44px 규칙이 layer 밖이라 min-h-*를 이긴다. 높이를 명시로 고정한다.
    'relative flex h-13 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 type-compact-action font-semibold',
    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
    isActive ? 'text-brand-700' : 'text-stone-500',
  )
}

const adminNavigation: NavigationItem[] = [
  { icon: CircleUserRound, inBottomNav: true, label: '회원', to: routes.admin },
  { icon: List, inBottomNav: true, label: '강의실', to: `${routes.admin}?tab=classrooms` },
  { icon: Sparkles, inBottomNav: true, label: 'AI 사용량', to: `${routes.admin}?tab=ai-usage` },
  { icon: CircleDollarSign, label: 'xAI 관리', to: `${routes.admin}?tab=xai` },
  { icon: ServerCog, label: '인프라', to: `${routes.admin}?tab=infra` },
  { icon: CalendarDays, label: '업데이트', to: `${routes.admin}?tab=updates` },
]

function adminTabFromLocation(value: string): string {
  const query = value.split('?')[1] ?? ''
  return new URLSearchParams(query).get('tab') ?? 'users'
}
