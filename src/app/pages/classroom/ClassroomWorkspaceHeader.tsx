import { useContext, useEffect, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange, KeyRound, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../../features/auth'
import type { Classroom } from '../../../features/classrooms'
import { PageHeader } from '../../../shared/ui'
import {
  classroomAnalyticsPath,
  classroomDetailPath,
  classroomEditPath,
} from '../../routes'
import { ClassroomWorkspaceShellContext } from './ClassroomWorkspaceShellContext'

export type ClassroomWorkspaceTab = 'course' | 'learning' | 'settings'

export function ClassroomHeaderInfoBar({
  classroom,
  inviteCodeDisabled = false,
  onInviteCodeClick,
  showInviteCode = false,
}: {
  classroom: Classroom
  inviteCodeDisabled?: boolean
  onInviteCodeClick?: () => void
  showInviteCode?: boolean
}) {
  return (
    <div aria-label="강의실 정보" className="mobile-horizontal-scroll flex min-h-10 max-w-full items-stretch overflow-x-auto rounded-lg border border-stone-200 bg-white text-stone-600 mobile-web:min-h-11" role="group">
      <span className="flex min-w-0 items-center gap-1.5 px-3 type-control">
        <CalendarRange aria-hidden="true" className="shrink-0 text-stone-400" size={14} />
        <span className="truncate">{formatClassroomPeriod(classroom.startDate, classroom.endDate)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 border-l border-stone-200 px-3 type-control">
        <Users aria-hidden="true" className="text-stone-400" size={14} />
        수강생 {classroom.learnerCount}명
      </span>
      {showInviteCode ? (
        <button
          aria-label={`초대 코드 ${classroom.inviteCode ?? '확인'} 복사`}
          className="flex shrink-0 items-center gap-1.5 border-l border-stone-200 px-3 type-control font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
          disabled={inviteCodeDisabled}
          onClick={onInviteCodeClick}
          title="초대 코드 복사"
          type="button"
        >
          <KeyRound aria-hidden="true" size={14} />
          <span className="font-mono">{classroom.inviteCode ?? '초대 코드'}</span>
        </button>
      ) : null}
    </div>
  )
}

export function ClassroomWorkspaceHeader({
  actionSlotRef,
  actions,
  activeTab,
  classroom,
  root = false,
  showClassroomSummary,
  showTabs = true,
  titleAccessory,
  titleAccessorySlotRef,
}: {
  actionSlotRef?: Ref<HTMLDivElement>
  actions?: ReactNode
  activeTab: ClassroomWorkspaceTab
  classroom: Classroom
  root?: boolean
  showClassroomSummary?: boolean
  showTabs?: boolean
  titleAccessory?: ReactNode
  titleAccessorySlotRef?: Ref<HTMLDivElement>
}) {
  const workspaceShell = useContext(ClassroomWorkspaceShellContext)
  const { user } = useAuth()
  const shouldShowClassroomSummary = showClassroomSummary ?? activeTab === 'course'
  const tabs = isInstructorRole(user?.role)
    ? [
        { id: 'course' as const, label: '강의', to: classroomDetailPath(classroom.id) },
        { id: 'learning' as const, label: '학습현황', to: classroomAnalyticsPath(classroom.id) },
        { id: 'settings' as const, label: '관리', to: classroomEditPath(classroom.id) },
      ]
    : []

  useEffect(() => {
    if (!root) workspaceShell?.syncClassroom(classroom)
  }, [classroom, root, workspaceShell])

  if (!root && workspaceShell) {
    return (
      <>
        {titleAccessory && workspaceShell.titleAccessoryTarget
          ? createPortal(titleAccessory, workspaceShell.titleAccessoryTarget)
          : null}
        {actions && workspaceShell.actionTarget
          ? createPortal(actions, workspaceShell.actionTarget)
          : null}
      </>
    )
  }

  return (
    <header className="shrink-0">
      <div className="lg:h-10">
        <PageHeader
          actions={actions || actionSlotRef ? <div className="contents" ref={actionSlotRef}>{actions}</div> : undefined}
          title={classroom.name}
          titleAccessory={<>
            {shouldShowClassroomSummary ? <p className="type-control text-stone-500">
              {formatClassroomPeriod(classroom.startDate, classroom.endDate)} · 수강생 {classroom.learnerCount}명
            </p> : null}
            {titleAccessory || titleAccessorySlotRef ? <div className="contents" ref={titleAccessorySlotRef}>{titleAccessory}</div> : null}
          </>}
        />
      </div>
      {showTabs && tabs.length > 0 ? <nav aria-label="강의실 메뉴" className="mobile-horizontal-scroll mt-4 flex h-11 items-stretch gap-7 overflow-x-auto border-b border-stone-200 mobile-web:h-12">
        {tabs.map((tab) => <Link aria-current={activeTab === tab.id ? 'page' : undefined} className={activeTab === tab.id ? 'relative flex shrink-0 items-center type-body font-semibold text-stone-950 after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-brand-600' : 'relative flex shrink-0 items-center type-body font-semibold text-stone-500 hover:text-stone-900'} key={tab.id} preventScrollReset to={tab.to}>{tab.label}</Link>)}
      </nav> : null}
    </header>
  )
}

function formatClassroomPeriod(startDate: string, endDate: string): string {
  const start = formatLocalDate(startDate)
  const end = formatLocalDate(endDate)
  return start && end ? `${start} - ${end}` : '수업 기간 미정'
}

function formatLocalDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return ''
  return `${year}. ${month}. ${day}.`
}
