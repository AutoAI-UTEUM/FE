export const LEARNING_TEXT_SIZES = ['small', 'medium', 'large'] as const

export type LearningTextSize = (typeof LEARNING_TEXT_SIZES)[number]

export const DEFAULT_LEARNING_TEXT_SIZE: LearningTextSize = 'medium'

export const LEARNING_TEXT_SIZE_LABELS: Record<LearningTextSize, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
}

export const LEARNING_TEXT_SIZE_PERCENTAGES: Record<LearningTextSize, number> = {
  small: 88,
  medium: 100,
  large: 113,
}

export function getLearningTextSizeStorageKey(ownerId?: number | string): string {
  return `uteum:learning-text-size:${ownerId ?? 'guest'}`
}

export function readLearningTextSize(ownerId?: number | string): LearningTextSize {
  if (typeof window === 'undefined') return DEFAULT_LEARNING_TEXT_SIZE
  const value = window.localStorage.getItem(getLearningTextSizeStorageKey(ownerId))
  return isLearningTextSize(value) ? value : DEFAULT_LEARNING_TEXT_SIZE
}

export function writeLearningTextSize(
  ownerId: number | string | undefined,
  value: LearningTextSize,
) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getLearningTextSizeStorageKey(ownerId), value)
}

export function getAdjacentLearningTextSize(
  current: LearningTextSize,
  direction: -1 | 1,
): LearningTextSize {
  const currentIndex = LEARNING_TEXT_SIZES.indexOf(current)
  const nextIndex = Math.min(
    LEARNING_TEXT_SIZES.length - 1,
    Math.max(0, currentIndex + direction),
  )
  return LEARNING_TEXT_SIZES[nextIndex]
}

function isLearningTextSize(value: string | null): value is LearningTextSize {
  return value !== null && LEARNING_TEXT_SIZES.includes(value as LearningTextSize)
}
