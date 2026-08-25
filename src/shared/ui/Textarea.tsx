import type { TextareaHTMLAttributes } from 'react'

import { cx } from '../lib/cx'

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  description?: string
  error?: string
  id: string
  label: string
  labelHidden?: boolean
}

export function Textarea({
  className,
  description,
  error,
  id,
  label,
  labelHidden = false,
  ...props
}: TextareaProps) {
  const describedBy = getDescribedBy({ description, error, id })

  return (
    <div>
      <div
        className={
          labelHidden ? undefined : 'flex items-baseline justify-between gap-3'
        }
      >
        <label
          className={
            labelHidden
              ? 'sr-only'
              : 'shrink-0 type-body font-semibold text-stone-800'
          }
          htmlFor={id}
        >
          {label}
        </label>
        {error && !labelHidden ? (
          <p
            className="min-w-0 text-right type-caption font-medium leading-tight text-rose-700"
            id={`${id}-error`}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
      <textarea
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cx(
          'mt-1.5 block min-h-20 w-full resize-y rounded-lg border bg-white px-3 py-2 type-body text-stone-950',
          'placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100',
          error ? 'border-rose-400' : 'border-stone-300',
          labelHidden && 'mt-0',
          className,
        )}
        id={id}
        {...props}
      />
      {description ? (
        <p className="mt-1 type-caption text-stone-500" id={`${id}-description`}>
          {description}
        </p>
      ) : null}
      {error && labelHidden ? (
        <p className="mt-1 type-caption font-medium text-rose-700" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

function getDescribedBy({
  description,
  error,
  id,
}: Pick<TextareaProps, 'description' | 'error' | 'id'>): string | undefined {
  const ids = [
    description ? `${id}-description` : undefined,
    error ? `${id}-error` : undefined,
  ].filter(Boolean)

  return ids.length > 0 ? ids.join(' ') : undefined
}
