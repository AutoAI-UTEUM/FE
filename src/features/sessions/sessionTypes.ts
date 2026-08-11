export type LearningSessionStatus = 'ACTIVE' | 'COMPLETED' | 'DELETED' | 'PAUSED'

export interface LearningSession {
  activeQuizId?: string
  currentPage: number
  id: string
  lastActivityAt: string
  materialId?: string
  materialTitle: string
  pageStatus?: string
  pendingDiagnosis?: PendingDiagnosisReference
  status: LearningSessionStatus
  totalPages?: number
  uiActions?: UiAction[]
}

export interface PendingDiagnosisReference {
  diagnosisId: string
  prompt?: string
  quizScore?: number
  sourceQuestion?: string
}

export type UiActionEvent =
  | 'COMPLETE_SESSION'
  | 'EXPLAIN_CURRENT_PAGE'
  | 'MOVE_NEXT_PAGE'
  | 'SHOW_QUIZ_TYPE_SELECT'
  | 'WAIT'

export type UiAction =
  | {
      kind: 'BINARY_DECISION'
      label: string
      noEvent: UiActionEvent
      yesEvent: UiActionEvent
    }
  | {
      diagnosisId: string
      kind: 'DIAGNOSIS_QUESTION'
      label: string
    }
  | {
      kind: 'MOVE_NEXT_PAGE'
      label: string
      step?: number
    }
  | {
      durationMs: number
      kind: 'WAIT'
      label: string
    }

export interface SessionMessage {
  content: string
  createdAt: string
  id: string
  messageType?: string
  pageNumber?: number
  senderType: 'AI' | 'USER'
  status?: 'COMPLETED' | 'FAILED' | 'PENDING'
}

export interface SessionTurnResult {
  activeQuizId?: string | null
  currentPage?: number
  messages: SessionMessage[]
  pageStatus?: string
  pendingDiagnosis?: PendingDiagnosisReference | null
  uiActions: UiAction[]
}

export interface SessionQuizSummary {
  createdAt?: string
  maxScore?: number
  passed?: boolean
  quizId: string
  quizType: string
  score?: number
  submitted?: boolean
  title: string
}
