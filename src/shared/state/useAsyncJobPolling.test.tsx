import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAsyncJobPolling } from './useAsyncJobPolling'

interface Job { status: 'PROCESSING' | 'COMPLETED' }

afterEach(() => {
  vi.useRealTimers()
})

describe('useAsyncJobPolling', () => {
  it('continues from the response body status and stops on completion', async () => {
    vi.useFakeTimers()
    const fetchNext = vi.fn()
      .mockResolvedValueOnce({ status: 'PROCESSING' } satisfies Job)
      .mockResolvedValueOnce({ status: 'COMPLETED' } satisfies Job)
    const onResult = vi.fn()

    render(<PollingHarness fetchNext={fetchNext} onResult={onResult} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(fetchNext).toHaveBeenCalledTimes(2)
    expect(onResult).toHaveBeenLastCalledWith({ status: 'COMPLETED' })
  })

  it('reports a delayed job without starting another request', async () => {
    vi.useFakeTimers()
    const fetchNext = vi.fn().mockResolvedValue({ status: 'PROCESSING' } satisfies Job)
    const onDelayed = vi.fn()

    render(<PollingHarness fetchNext={fetchNext} maxDurationMs={2500} onDelayed={onDelayed} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })

    expect(fetchNext).toHaveBeenCalledTimes(1)
    expect(onDelayed).toHaveBeenCalledTimes(1)
  })

  it('can continue polling after a transient request failure', async () => {
    vi.useFakeTimers()
    const fetchNext = vi.fn()
      .mockRejectedValueOnce(new Error('일시 오류'))
      .mockResolvedValueOnce({ status: 'COMPLETED' } satisfies Job)
    const onError = vi.fn()
    const onResult = vi.fn()

    render(
      <PollingHarness
        continueOnError
        fetchNext={fetchNext}
        onError={onError}
        onResult={onResult}
      />,
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(fetchNext).toHaveBeenCalledTimes(2)
    expect(onResult).toHaveBeenCalledWith({ status: 'COMPLETED' })
  })
})

function PollingHarness({
  continueOnError = false,
  fetchNext,
  maxDurationMs = 10_000,
  onDelayed = vi.fn(),
  onResult = vi.fn(),
  onError = vi.fn(),
}: {
  continueOnError?: boolean
  fetchNext: (signal: AbortSignal) => Promise<Job>
  maxDurationMs?: number
  onDelayed?: () => void
  onResult?: (job: Job) => void
  onError?: (error: unknown) => void
}) {
  useAsyncJobPolling({
    continueOnError,
    enabled: true,
    fetchNext,
    getDelayMs: () => 2000,
    initialDelayMs: 1000,
    isPending: (job) => job.status === 'PROCESSING',
    maxDurationMs,
    onDelayed,
    onError,
    onResult,
  })
  return null
}
