export const routes = {
  root: '/',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  authCallback: '/auth/callback',
  signup: '/signup',
  classrooms: '/classrooms',
  classroomDetail: '/classrooms/:classroomId',
  classroomStudents: '/classrooms/:classroomId/students',
  classroomSettings: '/classrooms/:classroomId/settings',
  classroomCalendar: '/classrooms/:classroomId/calendar',
  classroomAnalytics: '/classrooms/:classroomId/analytics',
  classroomAnnouncements: '/classrooms/:classroomId/announcements',
  classroomExams: '/classrooms/:classroomId/exams',
  classroomExamDetail: '/classrooms/:classroomId/exams/:examId',
  classroomEntranceRequests: '/classrooms/:classroomId/entrance-requests',
  classroomReports: '/classrooms/:classroomId/reports',
  classroomStudentReports: '/classrooms/:classroomId/students/:studentId/reports',
  classroomReportDetail: '/classrooms/:classroomId/students/:studentId/reports/:reportId',
  classroomReportCriteria: '/classrooms/:classroomId/report-criteria',
  legacyReportDetail: '/reports/:reportId',
  legacyClassroomEdit: '/classrooms/:classroomId/edit',
  calendar: '/calendar',
  management: '/management',
  notes: '/notes',
  reviewQuizzes: '/review-quizzes',
  exams: '/exams',
  examDetail: '/exams/:examId',
  learningStatus: '/learning-status',
  announcements: '/announcements',
  entranceRequests: '/entrance-requests',
  materials: '/materials',
  materialViewer: '/materials/:materialId',
  sessions: '/sessions',
  sessionDetail: '/sessions/:sessionId',
  settings: '/settings',
  quizDetail: '/quizzes/:quizId',
  diagnosis: '/sessions/:sessionId/diagnosis/:diagnosisId',
} as const

export function classroomDetailPath(classroomId: string | number): string {
  return `/classrooms/${classroomId}`
}

export function classroomEditPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/settings`
}

export function classroomStudentsPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/students`
}

export function learningStatusPath(classroomId: string | number): string {
  return classroomAnalyticsPath(classroomId)
}

export function classroomCalendarPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/calendar`
}

export function classroomAnalyticsPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/analytics`
}

export function classroomAnnouncementsPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/announcements`
}

export function classroomExamsPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/exams`
}

export function classroomExamDetailPath(classroomId: string | number, examId: string | number): string {
  return `${classroomExamsPath(classroomId)}/${encodeURIComponent(String(examId))}`
}

export function classroomEntranceRequestsPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/entrance-requests`
}

export function classroomReportsPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/reports`
}

export function classroomStudentReportsPath(classroomId: string | number, studentId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/students/${encodeURIComponent(String(studentId))}/reports`
}

export function classroomReportDetailPath(classroomId: string | number, studentId: string | number, reportId: string | number): string {
  return `${classroomStudentReportsPath(classroomId, studentId)}/${encodeURIComponent(String(reportId))}`
}

export function classroomReportCriteriaPath(classroomId: string | number): string {
  return `/classrooms/${encodeURIComponent(String(classroomId))}/report-criteria`
}

export function materialViewerPath(materialId: string | number): string {
  return `/materials/${materialId}`
}

export function sessionDetailPath(sessionId: string | number): string {
  return `/sessions/${sessionId}`
}

export function quizDetailPath(quizId: string | number): string {
  return `/quizzes/${quizId}`
}

export function examDetailPath(examId: string | number, classroomId?: string | number): string {
  return classroomId === undefined
    ? `/exams/${encodeURIComponent(String(examId))}`
    : classroomExamDetailPath(classroomId, examId)
}

export function diagnosisPath(
  sessionId: string | number,
  diagnosisId: string | number,
): string {
  return `/sessions/${sessionId}/diagnosis/${diagnosisId}`
}
