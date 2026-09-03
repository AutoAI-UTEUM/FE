import { act, renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  getResponsiveViewportMode,
  ResponsiveViewportProvider,
  useResponsiveViewport,
} from './ResponsiveViewportProvider'

describe('responsive viewport mode', () => {
  it('keeps fine-pointer computers on the desktop layout at tablet widths', () => {
    expect(getResponsiveViewportMode({
      coarsePointer: false,
      screenHeight: 768,
      screenWidth: 1024,
    })).toBe('desktop')
  })

  it('classifies phones independently from orientation', () => {
    expect(getResponsiveViewportMode({ coarsePointer: true, screenHeight: 844, screenWidth: 390 })).toBe('phone')
    expect(getResponsiveViewportMode({ coarsePointer: true, screenHeight: 390, screenWidth: 844 })).toBe('phone')
  })

  it('classifies common portrait and landscape tablets', () => {
    expect(getResponsiveViewportMode({ coarsePointer: true, screenHeight: 1180, screenWidth: 820 })).toBe('tablet-portrait')
    expect(getResponsiveViewportMode({ coarsePointer: true, screenHeight: 1024, screenWidth: 1366 })).toBe('tablet-landscape')
  })

  it('does not apply mobile layout to large touch displays', () => {
    expect(getResponsiveViewportMode({ coarsePointer: true, screenHeight: 900, screenWidth: 1440 })).toBe('desktop')
  })

  it('updates the shared mode when orientation changes', () => {
    const listeners = new Map<string, () => void>()
    let portrait = true
    Object.defineProperties(window.screen, {
      height: { configurable: true, get: () => portrait ? 1180 : 820 },
      width: { configurable: true, get: () => portrait ? 820 : 1180 },
    })
    const matchMedia = vi.fn((query: string) => ({
      addEventListener: (_event: string, listener: () => void) => {
        listeners.set(query, listener)
      },
      addListener: () => undefined,
      dispatchEvent: () => true,
      matches: query === '(pointer: coarse)' || (query === '(orientation: portrait)' && portrait),
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    } as unknown as MediaQueryList))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMedia,
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ResponsiveViewportProvider>{children}</ResponsiveViewportProvider>
    )
    const { result } = renderHook(() => useResponsiveViewport(), { wrapper })
    expect(result.current.mode).toBe('tablet-portrait')

    act(() => {
      portrait = false
      listeners.get('(orientation: portrait)')?.()
    })
    expect(result.current.mode).toBe('tablet-landscape')
  })
})
