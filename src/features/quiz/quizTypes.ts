export type QuizKind = 'ESSAY' | 'MCQ' | 'OX' | 'SHORT'

export interface QuizChoice {
  id: string
  label: string
}

export interface PublicQuizQuestion {
  choices?: QuizChoice[]
  id: string
  kind: QuizKind
  prompt: string
}

export type QuizAnswers = Record<string, string>

export interface PublicQuiz {
  coverageEndPage?: number
  coverageStartPage?: number
  id: string
  kind: QuizKind
  page?: number
  questions: PublicQuizQuestion[]
  sessionId: string
  submitted: boolean
  title: string
}

export interface PublicQuizFeedback {
  correctAnswer?: string
  explanation?: string
  maxScore?: number
  message: string
  questionId: string
  score?: number
  submittedAnswer?: string
  verdict: 'CORRECT' | 'PARTIAL' | 'UNKNOWN' | 'WRONG'
}

export interface PublicQuizResult {
  diagnosisEntry?: {
    diagnosisId: string
    sessionId: string
  }
  feedback: PublicQuizFeedback[]
  maxScore?: number
  passed?: boolean
  score: number
  submittedAt: string
}
