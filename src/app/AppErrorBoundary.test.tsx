import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppErrorBoundary } from './AppErrorBoundary'
import { reportRenderError } from './renderErrorReporter'

let renderFailureMessage = 'render failed'
let renderFailureName = 'Error'

function BrokenView(): never {
  const error = new Error(renderFailureMessage)
  error.name = renderFailureName
  throw error
}

describe('AppErrorBoundary', () => {
  it('shows a reload action instead of leaving a blank screen', () => {
    const onReload = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary onReload={onReload}>
        <BrokenView />
      </AppErrorBoundary>,
    )

    expect(screen.getByText('화면을 불러오지 못했습니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(onReload).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('does not print synthetic credentials from render failures', () => {
    const syntheticToken = 'synthetic-access-token-acceptance-only'
    renderFailureMessage = `render failed with token=${syntheticToken}`
    renderFailureName = `TokenError-${syntheticToken}`
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>,
      { onCaughtError: reportRenderError },
    )

    const renderedConsoleArguments = consoleError.mock.calls
      .flatMap((call) => call.map((value) =>
        value instanceof Error ? `${value.name}:${value.message}` : JSON.stringify(value),
      ))
      .join('\n')
    expect(renderedConsoleArguments).not.toContain(syntheticToken)
    renderFailureMessage = 'render failed'
    renderFailureName = 'Error'
    consoleError.mockRestore()
  })
})
