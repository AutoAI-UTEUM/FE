import type { CreateExamInput, ExamQuestionInput, ExamQuestionType } from './examsRepository'

export function createQuestion(type: ExamQuestionType, questionText = '', points = 10): ExamQuestionInput {
  const base = { points, questionText, questionType: type }
  if (type === 'MCQ') return { ...base, answerChoiceId: 'a', options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '' })) }
  if (type === 'OX') return { ...base, answerValue: true }
  if (type === 'SHORT') return { ...base, referenceAnswer: '' }
  return { ...base, modelAnswer: '' }
}

export function isExamDraftValid(value: CreateExamInput): boolean {
  return Boolean(value.title.trim()) && value.questions.every((question) => question.questionText.trim() && question.points > 0)
}
