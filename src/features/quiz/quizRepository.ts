import { ApiClientError } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'
import type {
  PublicQuiz,
  PublicQuizQuestion,
  PublicQuizResult,
  QuizAnswers,
  QuizChoice,
  QuizKind,
} from './quizTypes'

interface QuizChoiceDto {
  optionId: number | string
  text: string
}

interface QuizQuestionDto {
  maxScore?: number
  options?: QuizChoiceDto[]
  questionId: number | string
  questionText: string
}

interface PublicQuizDto {
  coverageEndPage?: number
  coverageStartPage?: number
  page?: number
  questions: QuizQuestionDto[]
  quizId: number | string
  quizType: QuizKind
  sessionId: number | string
  submitted: boolean
  title: string
}

interface QuizSubmitDto {
  gradingResult?: {
    items?: Array<{
      feedback?: string
      maxScore?: number
      questionId: number | string
      score?: number
      verdict?: string
    }>
  }
  maxScore?: number
  passed?: boolean
  quizId: number | string
  score: number
  submissionId: number | string
  uiActions?: Array<{
    diagnosisId?: number | string
    type: string
  }>
}

export interface QuizRepository {
  getById: (
    quizId: string,
    signal?: AbortSignal,
  ) => Promise<PublicQuiz | null>
  submit: (
    quiz: PublicQuiz,
    answers: QuizAnswers,
    signal?: AbortSignal,
  ) => Promise<PublicQuizResult>
}

export function createQuizRepository(
  request: AuthenticatedRequest,
): QuizRepository {
  return {
    async getById(quizId, signal) {
      try {
        const { data } = await request<PublicQuizDto>(
          `/api/quizzes/${encodeURIComponent(quizId)}`,
          { signal },
        )
        return mapQuiz(data)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null
        throw error
      }
    },
    async submit(quiz, answers, signal) {
      const { data } = await request<QuizSubmitDto>(
        `/api/quizzes/${encodeURIComponent(quiz.id)}/submit`,
        {
          body: {
            answers: quiz.questions.map((question) => ({
              answer: answers[question.id] ?? '',
              questionId: question.id,
            })),
            requestId:
              typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `quiz-${Date.now()}`,
          },
          method: 'POST',
          signal,
        },
      )
      const diagnosisAction = data.uiActions?.find(
        (action) =>
          action.type === 'DIAGNOSIS_QUESTION' &&
          action.diagnosisId !== undefined,
      )

      return {
        diagnosisEntry:
          diagnosisAction?.diagnosisId === undefined
            ? undefined
            : {
                diagnosisId: String(diagnosisAction.diagnosisId),
                sessionId: quiz.sessionId,
              },
        feedback: (data.gradingResult?.items ?? []).map((item) => ({
          maxScore: item.maxScore,
          message: item.feedback ?? '채점이 완료되었습니다.',
          questionId: String(item.questionId),
          score: item.score,
          verdict: mapVerdict(item.verdict),
        })),
        maxScore: data.maxScore,
        passed: data.passed,
        score: data.score,
        submittedAt: new Date().toISOString(),
      }
    },
  }
}

function mapVerdict(value: string | undefined): 'CORRECT' | 'PARTIAL' | 'UNKNOWN' | 'WRONG' {
  return value === 'CORRECT' || value === 'PARTIAL' || value === 'WRONG'
    ? value
    : 'UNKNOWN'
}

function mapQuiz(quiz: PublicQuizDto): PublicQuiz {
  return {
    coverageEndPage: quiz.coverageEndPage,
    coverageStartPage: quiz.coverageStartPage,
    id: String(quiz.quizId),
    kind: quiz.quizType,
    page: quiz.page,
    questions: quiz.questions.map((question) =>
      mapQuestion(question, quiz.quizType),
    ),
    sessionId: String(quiz.sessionId),
    submitted: quiz.submitted,
    title: quiz.title,
  }
}

function mapQuestion(
  question: QuizQuestionDto,
  quizKind: QuizKind,
): PublicQuizQuestion {
  return {
    choices: mapQuestionChoices(question.options, quizKind),
    id: String(question.questionId),
    kind: quizKind,
    prompt: question.questionText,
  }
}

function mapQuestionChoices(
  options: QuizChoiceDto[] | undefined,
  quizKind: QuizKind,
): QuizChoice[] | undefined {
  if (options && options.length > 0) return options.map(mapChoice)
  if (quizKind !== 'OX') return undefined
  return [
    { id: 'true', label: 'O' },
    { id: 'false', label: 'X' },
  ]
}

function mapChoice(choice: QuizChoiceDto): QuizChoice {
  return {
    id: String(choice.optionId),
    label: choice.text,
  }
}
