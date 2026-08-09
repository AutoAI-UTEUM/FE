import { ArrowRight, Check, Clock3, Stethoscope, X } from 'lucide-react'

import type { UiAction, UiActionEvent } from './sessionTypes'

interface UiActionsRendererProps {
  actions: UiAction[]
  disabled?: boolean
  onEvent: (event: UiActionEvent, selection?: UiActionSelection) => void
  onOpenDiagnosis: (diagnosisId: string) => void
}

export interface UiActionSelection {
  action: UiAction
  choice?: 'no' | 'yes'
}

const decisionButtonClassName =
  'flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 type-body font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60'

export function UiActionsRenderer({
  actions,
  disabled = false,
  onEvent,
  onOpenDiagnosis,
}: UiActionsRendererProps) {
  return (
    <div className="grid gap-2">
      {actions.map((action) => {
        if (action.kind === 'BINARY_DECISION') {
          return (
            <div
              className="min-w-64"
              key={`${action.kind}-${action.label}`}
            >
              <p className="type-body font-semibold text-stone-900">{action.label}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className={`${decisionButtonClassName} border-brand-600 bg-brand-700 text-white hover:bg-brand-800`}
                  disabled={disabled}
                  onClick={() => onEvent(action.yesEvent, { action, choice: 'yes' })}
                  type="button"
                >
                  <Check aria-hidden="true" size={14} />네
                </button>
                <button
                  className={`${decisionButtonClassName} border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
                  disabled={disabled}
                  onClick={() => onEvent(action.noEvent, { action, choice: 'no' })}
                  type="button"
                >
                  <X aria-hidden="true" size={14} />
                  아니요
                </button>
              </div>
            </div>
          )
        }

        if (action.kind === 'DIAGNOSIS_QUESTION') {
          return (
            <div
              className="min-w-64"
              key={`${action.kind}-${action.diagnosisId}`}
            >
              <p className="type-body font-semibold text-stone-900">{action.label}</p>
              <button
                className={`${decisionButtonClassName} mt-2 w-full border-amber-600 bg-amber-600 text-white hover:bg-amber-700`}
                disabled={disabled}
                onClick={() => onOpenDiagnosis(action.diagnosisId)}
                type="button"
              >
                <Stethoscope aria-hidden="true" size={14} />
                진단 답변 작성
              </button>
            </div>
          )
        }

        if (action.kind === 'MOVE_NEXT_PAGE') {
          return (
            <button
              className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-left type-body font-semibold text-brand-900 hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              key={`${action.kind}-${action.label}`}
              onClick={() => onEvent('MOVE_NEXT_PAGE', { action })}
              type="button"
            >
              {action.label}
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          )
        }

        return (
          <div
            className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 type-body text-stone-700"
            key={`${action.kind}-${action.label}`}
            role="status"
          >
            <Clock3 aria-hidden="true" className="shrink-0 text-stone-500" size={15} />
            <span>{action.label}</span>
          </div>
        )
      })}
    </div>
  )
}
