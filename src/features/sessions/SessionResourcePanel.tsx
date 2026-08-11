import { ChevronLeft, PanelLeftClose } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cx } from '../../shared/lib/cx'
import type { SessionQuizSummary } from './sessionTypes'

export interface SessionResourceMaterial {
  id: string
  quizzes: SessionQuizSummary[]
  sessionId?: string
  status: 'PROCESSING' | 'READY' | 'FAILED'
  title: string
}

export interface SessionResourceWeek {
  id: string
  materials: SessionResourceMaterial[]
  title: string
  weekNumber: number
}

interface SessionResourcePanelProps {
  activeMaterialId?: string
  backLabel: string
  backTo: string
  onClose: () => void
  onOpenQuiz: (quizId: string) => void
  resourcePath: (material: SessionResourceMaterial) => string
  weeks: SessionResourceWeek[]
}

export function SessionResourcePanel({
  activeMaterialId,
  backLabel,
  backTo,
  onClose,
  onOpenQuiz,
  resourcePath,
  weeks,
}: SessionResourcePanelProps) {
  return (
    <aside className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-stone-200 bg-stone-50/60 p-3 xl:flex">
      <div className="flex items-center gap-1">
        <Link
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 type-control text-stone-500 hover:bg-white hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          to={backTo}
        >
          <ChevronLeft aria-hidden="true" size={14} />
          <span className="truncate">{backLabel}</span>
        </Link>
        <button
          aria-label="자료 목록 닫기"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-white hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          onClick={onClose}
          title="자료 목록 닫기"
          type="button"
        >
          <PanelLeftClose aria-hidden="true" size={15} />
        </button>
      </div>

      <div className="mt-3.5 grid gap-3">
        {weeks.map((week) => (
          <section key={week.id}>
            <div className="flex items-baseline gap-1.5 px-2 py-1">
              <h2 className="type-caption font-bold text-stone-700">
                {week.weekNumber}주차
              </h2>
              <p className="min-w-0 truncate type-micro text-stone-400">
                {week.title}
              </p>
            </div>
            <ul className="grid gap-0.5">
              {week.materials.map((material) => (
                <li key={material.id}>
                  <ResourceRow
                    isActive={material.id === activeMaterialId}
                    isMuted={material.status !== 'READY'}
                    to={resourcePath(material)}
                    title={material.title}
                  />
                  {material.quizzes.length > 0 ? (
                    <ul className="ml-8 grid gap-0.5 border-l border-stone-200 pl-1.5">
                      {material.quizzes.map((quiz) => (
                        <li key={quiz.quizId}>
                          <QuizRow onOpen={() => onOpenQuiz(quiz.quizId)} quiz={quiz} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {weeks.length === 0 ? (
          <p className="px-2 py-1.5 type-caption text-stone-400">
            현재 강의실의 자료를 찾을 수 없습니다.
          </p>
        ) : null}
      </div>

    </aside>
  )
}

function QuizRow({
  onOpen,
  quiz,
}: {
  onOpen: () => void
  quiz: SessionQuizSummary
}) {
  return (
    <button
      className="flex min-h-8 w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left type-caption text-stone-500 hover:bg-white hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      onClick={onOpen}
      type="button"
    >
      <span className="min-w-0 flex-1 break-words leading-5">{quiz.title}</span>
      <span className="shrink-0 type-micro text-stone-400">
        {getQuizKindLabel(quiz.quizType)}
      </span>
    </button>
  )
}

function ResourceRow({
  isActive = false,
  isMuted = false,
  title,
  to,
}: {
  isActive?: boolean
  isMuted?: boolean
  title: string
  to: string
}) {
  return (
    <Link
      className={cx(
        'flex min-h-9.5 items-center gap-2 rounded-lg px-2 py-2 type-control',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        isActive
          ? 'bg-white font-semibold text-stone-900 shadow-sm'
          : isMuted
            ? 'text-stone-400 hover:bg-white'
            : 'text-stone-600 hover:bg-white hover:text-stone-900',
      )}
      to={to}
    >
      <span
        className={cx(
          'flex h-5 w-8 shrink-0 items-center justify-center self-center rounded type-micro font-bold leading-none',
          getMaterialKind(title) === 'PPT'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-rose-100 text-rose-700',
        )}
      >
        {getMaterialKind(title)}
      </span>
      <span className="min-w-0 flex-1 break-words leading-5">{title}</span>
    </Link>
  )
}

function getMaterialKind(title: string): 'PDF' | 'PPT' {
  return /\.pptx?$/i.test(title.trim()) ? 'PPT' : 'PDF'
}

function getQuizKindLabel(quizType: string): string {
  const labels: Record<string, string> = {
    ESSAY: '서술형',
    MCQ: '객관식',
    OX: 'OX',
    SHORT: '단답형',
  }
  return labels[quizType] ?? quizType
}
