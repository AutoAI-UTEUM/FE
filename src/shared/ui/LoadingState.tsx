import { LoaderCircle } from 'lucide-react'

export interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = '불러오는 중입니다.' }: LoadingStateProps) {
  return (
    <div
      className="flex min-h-32 items-center justify-center gap-2 border-y border-stone-200 type-body font-medium text-stone-600"
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
      {message}
    </div>
  )
}
