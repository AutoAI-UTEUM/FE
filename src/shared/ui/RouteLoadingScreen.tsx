import { LoaderCircle } from 'lucide-react'

import { SERVICE_NAME } from '../config/brand'

export interface RouteLoadingScreenProps {
  message?: string
}

export function RouteLoadingScreen({
  message = '페이지를 불러오는 중입니다.',
}: RouteLoadingScreenProps) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-white px-6 text-stone-900">
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-3 text-center"
        role="status"
      >
        <strong className="type-dialog-title">{SERVICE_NAME}</strong>
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin text-brand-600"
          size={22}
        />
        <span className="type-body text-stone-500">{message}</span>
      </div>
    </div>
  )
}
