import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { RequireAuth, RequireInstructor } from '../features/auth'
import { RouteLoadingScreen } from '../shared/ui'
import { AppLayout } from './layouts/AppLayout'
import { LegacyClassroomRouteRedirect, LegacyClassroomSettingsRedirect, LegacyExamDetailRedirect } from './LegacyRouteRedirects'
import { AuthLayout } from './layouts/AuthLayout'
import { ClassroomWorkspaceLayout } from './pages/classroom/ClassroomWorkspaceLayout'
import { ClassroomContentLegacyRedirect } from './pages/classroom/ClassroomContentLegacyRedirect'
import { SettingsPage } from './pages/SettingsPage'
import { routes } from './routes'

const AuthCallbackPage = lazy(() => import('./pages/AuthCapabilityPages').then((module) => ({ default: module.AuthCallbackPage })))
const ResetPasswordPage = lazy(() => import('./pages/AuthCapabilityPages').then((module) => ({ default: module.ResetPasswordPage })))
const ClassroomsPage = lazy(() => import('./pages/ClassroomsPage').then((module) => ({ default: module.ClassroomsPage })))
const ClassroomDetailPage = lazy(() => import('./pages/ClassroomDetailPage').then((module) => ({ default: module.ClassroomDetailPage })))
const DiagnosisPage = lazy(() => import('./pages/DiagnosisPage').then((module) => ({ default: module.DiagnosisPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })))
const EntranceRequestsPage = lazy(() => import('./pages/EntranceRequestsPage').then((module) => ({ default: module.EntranceRequestsPage })))
const ExamDetailPage = lazy(() => import('./pages/ExamDetailPage').then((module) => ({ default: module.ExamDetailPage })))
const ExamsPage = lazy(() => import('./pages/ExamsPage').then((module) => ({ default: module.ExamsPage })))
const InstructorCalendarPage = lazy(() => import('./pages/instructor/InstructorCalendarPage').then((module) => ({ default: module.InstructorCalendarPage })))
const InstructorClassroomEditPage = lazy(() => import('./pages/instructor/InstructorClassroomEditPage').then((module) => ({ default: module.InstructorClassroomEditPage })))
const InstructorLearningStatusPage = lazy(() => import('./pages/instructor/InstructorLearningStatusPage').then((module) => ({ default: module.InstructorLearningStatusPage })))
const InstructorReportsPage = lazy(() => import('./pages/instructor/InstructorReportsPage').then((module) => ({ default: module.InstructorReportsPage })))
const InstructorReportCriteriaPage = lazy(() => import('./pages/instructor/InstructorReportsPage').then((module) => ({ default: module.InstructorReportCriteriaPage })))
const InstructorReportDetailPage = lazy(() => import('./pages/instructor/InstructorReportsPage').then((module) => ({ default: module.InstructorReportDetailPage })))
const InstructorStudentReportsPage = lazy(() => import('./pages/instructor/InstructorReportsPage').then((module) => ({ default: module.InstructorStudentReportsPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const LearnerNotesPage = lazy(() => import('./pages/learner/LearnerNotesPage').then((module) => ({ default: module.LearnerNotesPage })))
const LearnerNoteCreatePage = lazy(() => import('./pages/learner/LearnerNotesPage').then((module) => ({ default: module.LearnerNoteCreatePage })))
const LearnerReviewQuizzesPage = lazy(() => import('./pages/learner/LearnerReviewQuizzesPage').then((module) => ({ default: module.LearnerReviewQuizzesPage })))
const MaterialViewerRedirectPage = lazy(() => import('./pages/MaterialViewerRedirectPage').then((module) => ({ default: module.MaterialViewerRedirectPage })))
const MaterialsPage = lazy(() => import('./pages/MaterialsPage').then((module) => ({ default: module.MaterialsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const QuizPage = lazy(() => import('./pages/QuizPage').then((module) => ({ default: module.QuizPage })))
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })))
const SignupPage = lazy(() => import('./pages/SignupPage').then((module) => ({ default: module.SignupPage })))

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingScreen />}>
      <Routes>
      <Route
        path={routes.root}
        element={<Navigate to={routes.classrooms} replace />}
      />

      <Route element={<AuthLayout />}>
        <Route path={routes.login} element={<LoginPage />} />
        <Route
          path={routes.forgotPassword}
          element={<ForgotPasswordPage />}
        />
        <Route path={routes.signup} element={<SignupPage />} />
        <Route path={routes.resetPassword} element={<ResetPasswordPage />} />
        <Route path={routes.authCallback} element={<AuthCallbackPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path={routes.classrooms} element={<ClassroomsPage />} />
          <Route path={routes.materials} element={<MaterialsPage />} />
          <Route path={routes.materialViewer} element={<MaterialViewerRedirectPage />} />
          <Route path={routes.sessions} element={<Navigate to={routes.classrooms} replace />} />
          <Route path={routes.sessionDetail} element={<SessionDetailPage />} />
          <Route path={routes.quizDetail} element={<QuizPage />} />
          <Route path={routes.diagnosis} element={<DiagnosisPage />} />
          <Route path={routes.settings} element={<SettingsPage />} />
          <Route path={routes.calendar} element={<InstructorCalendarPage />} />
          <Route path={routes.classroomCalendar} element={<InstructorCalendarPage />} />
          <Route path={routes.notes} element={<LearnerNotesPage />} />
          <Route path={routes.newNote} element={<LearnerNoteCreatePage />} />
          <Route path={routes.reviewQuizzes} element={<LearnerReviewQuizzesPage />} />
          <Route path={routes.exams} element={<ExamsPage />} />
          <Route path={routes.examDetail} element={<LegacyExamDetailRedirect />} />
          <Route path={routes.classroomExamDetail} element={<ExamDetailPage />} />
          <Route path={routes.classroomDetail} element={<ClassroomWorkspaceLayout />}>
            <Route index element={<ClassroomDetailPage />} />
            <Route path="exams" element={<ClassroomContentLegacyRedirect filter="exam" />} />
            <Route element={<RequireInstructor />}>
              <Route path="students" element={<Navigate to="../analytics" replace />} />
              <Route path="settings" element={<InstructorClassroomEditPage />} />
              <Route path="analytics" element={<InstructorLearningStatusPage />} />
              <Route path="reports" element={<InstructorReportsPage />} />
              <Route path="report-criteria" element={<InstructorReportCriteriaPage />} />
              <Route path="announcements" element={<ClassroomContentLegacyRedirect filter="notice" />} />
            </Route>
          </Route>
          <Route element={<RequireInstructor />}>
            <Route path={routes.legacyClassroomEdit} element={<LegacyClassroomSettingsRedirect />} />
            <Route
              path={routes.learningStatus}
              element={<LegacyClassroomRouteRedirect destination="analytics" />}
            />
            <Route
              path={routes.announcements}
              element={<LegacyClassroomRouteRedirect destination="announcements" />}
            />
            <Route
              path={routes.entranceRequests}
              element={<EntranceRequestsPage />}
            />
            <Route path={routes.classroomEntranceRequests} element={<Navigate to={routes.entranceRequests} replace />} />
            <Route path={routes.classroomStudentReports} element={<InstructorStudentReportsPage />} />
            <Route path={routes.classroomReportDetail} element={<InstructorReportDetailPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      </Routes>
    </Suspense>
  )
}
