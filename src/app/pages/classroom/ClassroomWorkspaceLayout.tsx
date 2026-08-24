import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type Classroom } from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { Button, EmptyState } from '../../../shared/ui'
import { ClassroomWorkspaceContainer } from './ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader, type ClassroomWorkspaceTab } from './ClassroomWorkspaceHeader'
import { ClassroomWorkspaceShellContext } from './ClassroomWorkspaceShellContext'

export function ClassroomWorkspaceLayout() {
  const { classroomId = '' } = useParams()
  const { pathname } = useLocation()
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null)
  const [titleAccessoryTarget, setTitleAccessoryTarget] = useState<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const usesFixedContentViewport = pathname.replace(/\/$/, '') === `/classrooms/${classroomId}`
  const normalizedPathname = pathname.replace(/\/$/, '')
  const usesDesktopFixedContentViewport = [
    `/classrooms/${classroomId}/analytics`,
    `/classrooms/${classroomId}/reports`,
  ].includes(normalizedPathname)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setClassroom(await repository.get(classroomId))
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [classroomId, repository])

  useEffect(() => {
    if (classroomId) rememberClassroomId(classroomId)
    const loadTimer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [classroomId, load])

  const syncClassroom = useCallback((nextClassroom: Classroom) => {
    setClassroom((current) => current === nextClassroom ? current : nextClassroom)
  }, [])
  const shellValue = useMemo(
    () => ({ actionTarget, syncClassroom, titleAccessoryTarget }),
    [actionTarget, syncClassroom, titleAccessoryTarget],
  )

  if (isLoading && !classroom) {
    return <ClassroomWorkspaceContainer><p className="py-16 text-center type-body text-stone-500" role="status">강의실 정보를 불러오는 중입니다.</p></ClassroomWorkspaceContainer>
  }
  if (error || !classroom) {
    return <ClassroomWorkspaceContainer><EmptyState action={<Button onClick={() => void load()} variant="secondary">다시 시도</Button>} description={error ?? '강의실 정보를 확인할 수 없습니다.'} title="강의실 정보를 불러오지 못했습니다" /></ClassroomWorkspaceContainer>
  }

  return (
    <ClassroomWorkspaceContainer
      className={usesFixedContentViewport
        ? 'lg:h-[calc(100dvh-2.5rem)] lg:overflow-hidden'
        : usesDesktopFixedContentViewport
          ? 'lg:h-[calc(100dvh-2.5rem)] lg:overflow-hidden'
          : undefined}
    >
      <ClassroomWorkspaceShellContext.Provider value={shellValue}>
        <ClassroomWorkspaceHeader
          actionSlotRef={setActionTarget}
          activeTab={getActiveTab(pathname)}
          classroom={classroom}
          root
          showClassroomSummary={!usesFixedContentViewport}
          titleAccessorySlotRef={setTitleAccessoryTarget}
        />
        <Outlet />
      </ClassroomWorkspaceShellContext.Provider>
    </ClassroomWorkspaceContainer>
  )
}

function getActiveTab(pathname: string): ClassroomWorkspaceTab {
  if (pathname.endsWith('/analytics') || pathname.endsWith('/students')) return 'learning'
  if (pathname.endsWith('/reports') || pathname.endsWith('/report-criteria')) return 'reports'
  if (pathname.endsWith('/settings')) return 'settings'
  return 'course'
}
