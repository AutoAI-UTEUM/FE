import type { ErrorInfo } from 'react'

export function reportRenderError(
  _error: unknown,
  errorInfo: Pick<ErrorInfo, 'componentStack'>,
) {
  console.error('Application render failed.', {
    componentStack: errorInfo.componentStack,
    errorType: 'render-error',
  })
}
