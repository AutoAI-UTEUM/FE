import { createContext } from 'react'

import type { Classroom } from '../../../features/classrooms'

export interface ClassroomWorkspaceShellValue {
  actionTarget: HTMLDivElement | null
  syncClassroom: (classroom: Classroom) => void
  titleAccessoryTarget: HTMLDivElement | null
}

export const ClassroomWorkspaceShellContext = createContext<ClassroomWorkspaceShellValue | null>(null)
