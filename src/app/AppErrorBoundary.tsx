import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

import { SERVICE_NAME } from '../shared/config/brand'

interface AppErrorBoundaryProps {
  children: ReactNode
  onReload?: () => void
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application render failed.', error, errorInfo)
  }

  private handleReload = () => {
    if (this.props.onReload) {
      this.props.onReload()
      return
    }

    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-white px-6 text-stone-900">
        <section className="flex max-w-md flex-col items-center text-center">
          <strong className="type-page-title">화면을 불러오지 못했습니다.</strong>
          <p className="mt-3 type-body text-stone-500">
            새 버전을 적용하려면 페이지를 다시 불러와 주세요.
          </p>
          <button
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand-700 px-5 type-button text-white hover:bg-brand-800"
            onClick={this.handleReload}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} />
            다시 불러오기
          </button>
          <span className="mt-5 type-caption text-stone-400">{SERVICE_NAME}</span>
        </section>
      </main>
    )
  }
}
