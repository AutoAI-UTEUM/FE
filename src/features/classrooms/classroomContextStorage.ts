const LAST_CLASSROOM_ID_KEY = 'edupilot:last-classroom-id'

export function getRememberedClassroomId(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_CLASSROOM_ID_KEY)
  } catch {
    return null
  }
}

export function rememberClassroomId(classroomId: string): void {
  if (!classroomId) return
  try {
    window.sessionStorage.setItem(LAST_CLASSROOM_ID_KEY, classroomId)
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
}
