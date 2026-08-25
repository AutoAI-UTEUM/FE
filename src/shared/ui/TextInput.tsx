import type { InputHTMLAttributes } from 'react'

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  description?: string
  error?: string
  id: string
  label: string
}

export function TextInput({
  className,
  description,
  error,
  id,
  label,
  ...props
}: TextInputProps) {
  const describedBy = getDescribedBy({ description, error, id })

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="shrink-0 type-control font-semibold text-stone-800" htmlFor={id}>
          {label}
        </label>
        {error ? (
          <p
            className="min-w-0 text-right type-caption font-medium leading-tight text-rose-700"
            id={`${id}-error`}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          'mt-1.5 block min-h-11 w-full rounded-[10px] border bg-white px-3.5 py-2 type-body text-stone-950',
          'placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100',
          error ? 'border-rose-400' : 'border-stone-300',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        id={id}
        {...props}
      />
      {description ? (
        <p className="mt-1 type-caption text-stone-500" id={`${id}-description`}>
          {description}
        </p>
      ) : null}
    </div>
  )
}

function getDescribedBy({
  description,
  error,
  id,
}: Pick<TextInputProps, 'description' | 'error' | 'id'>): string | undefined {
  const ids = [
    description ? `${id}-description` : undefined,
    error ? `${id}-error` : undefined,
  ].filter(Boolean)

  return ids.length > 0 ? ids.join(' ') : undefined
}
