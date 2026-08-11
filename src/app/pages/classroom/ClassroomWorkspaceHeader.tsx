import { useContext, useEffect, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
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

export function ClassroomWorkspaceHeader({
  actionSlotRef,
  actions,
  activeTab,
  classroom,
  root = false,
  showTabs = true,
  titleAccessory,
  titleAccessorySlotRef,
}: {
  actionSlotRef?: Ref<HTMLDivElement>
  actions?: ReactNode
  activeTab: ClassroomWorkspaceTab
  classroom: Classroom
  root?: boolean
  showTabs?: boolean
  titleAccessory?: ReactNode
  titleAccessorySlotRef?: Ref<HTMLDivElement>
}) {
  const workspaceShell = useContext(ClassroomWorkspaceShellContext)
  const { user } = useAuth()
  const tabs = isInstructorRole(user?.role)
    ? [
        { id: 'course' as const, label: '강의', to: classroomDetailPath(classroom.id) },
        { id: 'learning' as const, label: '학습 현황·리포트', to: classroomAnalyticsPath(classroom.id) },
        { id: 'settings' as const, label: '관리', to: classroomEditPath(classroom.id) },
      ]
    : [{ id: 'course' as const, label: '강의', to: classroomDetailPath(classroom.id) }]

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
    <header>
      <PageHeader
        actions={actions || actionSlotRef ? <div className="contents" ref={actionSlotRef}>{actions}</div> : undefined}
        title={classroom.name}
        titleAccessory={<>
          <p className="type-control text-stone-500">
            {formatClassroomPeriod(classroom.startDate, classroom.endDate)} · {classroom.weekCount}주차 · 수강생 {classroom.learnerCount}명
          </p>
          {titleAccessory || titleAccessorySlotRef ? <div className="contents" ref={titleAccessorySlotRef}>{titleAccessory}</div> : null}
        </>}
      />
      {showTabs ? <nav aria-label="강의실 메뉴" className="mt-4 flex h-11 items-stretch gap-7 overflow-x-auto border-b border-stone-200">
        {tabs.map((tab) => <Link aria-current={activeTab === tab.id ? 'page' : undefined} className={activeTab === tab.id ? 'relative flex shrink-0 items-center type-body font-bold text-stone-950 after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-brand-600' : 'relative flex shrink-0 items-center type-body font-medium text-stone-500 hover:text-stone-900'} key={tab.id} preventScrollReset to={tab.to}>{tab.label}</Link>)}
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
