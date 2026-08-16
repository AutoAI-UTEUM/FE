import { Navigate, Route, Routes } from 'react-router-dom'

import { RequireAuth, RequireInstructor } from '../features/auth'
import { AppLayout } from './layouts/AppLayout'
import { LegacyClassroomRouteRedirect, LegacyClassroomSettingsRedirect, LegacyExamDetailRedirect } from './LegacyRouteRedirects'
import { AuthLayout } from './layouts/AuthLayout'
import { AuthCallbackPage, ResetPasswordPage } from './pages/AuthCapabilityPages'
import { ClassroomsPage } from './pages/ClassroomsPage'
import { ClassroomDetailPage } from './pages/ClassroomDetailPage'
import { ClassroomWorkspaceLayout } from './pages/classroom/ClassroomWorkspaceLayout'
import { DiagnosisPage } from './pages/DiagnosisPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { EntranceRequestsPage } from './pages/EntranceRequestsPage'
import { ExamDetailPage } from './pages/ExamDetailPage'
import { ExamsPage } from './pages/ExamsPage'
import { InstructorCalendarPage } from './pages/instructor/InstructorCalendarPage'
import { InstructorClassroomEditPage } from './pages/instructor/InstructorClassroomEditPage'
import { InstructorLearningStatusPage } from './pages/instructor/InstructorLearningStatusPage'
import { ClassroomContentLegacyRedirect } from './pages/classroom/ClassroomContentLegacyRedirect'
import { LoginPage } from './pages/LoginPage'
import { LearnerNotesPage } from './pages/learner/LearnerNotesPage'
import { LearnerReviewQuizzesPage } from './pages/learner/LearnerReviewQuizzesPage'
import { MaterialViewerRedirectPage } from './pages/MaterialViewerRedirectPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { QuizPage } from './pages/QuizPage'
import { SessionDetailPage } from './pages/SessionDetailPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SignupPage } from './pages/SignupPage'
import { routes } from './routes'

export function AppRoutes() {
  return (
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
          <Route path={routes.sessions} element={<SessionsPage />} />
          <Route path={routes.sessionDetail} element={<SessionDetailPage />} />
          <Route path={routes.quizDetail} element={<QuizPage />} />
          <Route path={routes.diagnosis} element={<DiagnosisPage />} />
          <Route path={routes.settings} element={<SettingsPage />} />
          <Route path={routes.calendar} element={<InstructorCalendarPage />} />
          <Route path={routes.classroomCalendar} element={<InstructorCalendarPage />} />
          <Route path={routes.notes} element={<LearnerNotesPage />} />
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
            <Route path={routes.classroomReports} element={<LegacyClassroomRouteRedirect destination="analytics" />} />
            <Route path={routes.classroomStudentReports} element={<LegacyClassroomRouteRedirect destination="analytics" />} />
            <Route path={routes.classroomReportDetail} element={<LegacyClassroomRouteRedirect destination="analytics" />} />
            <Route path={routes.classroomReportCriteria} element={<LegacyClassroomRouteRedirect destination="analytics" />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
