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

  it('uses the orientation query when tablet screen dimensions lag behind rotation', () => {
    expect(getResponsiveViewportMode({
      coarsePointer: true,
      portraitOrientation: false,
      screenHeight: 1180,
      screenWidth: 820,
    })).toBe('tablet-landscape')
    expect(getResponsiveViewportMode({
      coarsePointer: true,
      portraitOrientation: true,
      screenHeight: 820,
      screenWidth: 1180,
    })).toBe('tablet-portrait')
  })

  it('does not apply mobile layout to large touch displays', () => {
    expect(getResponsiveViewportMode({ coarsePointer: true, screenHeight: 900, screenWidth: 1440 })).toBe('desktop')
  })

  it('keeps a tablet with a trackpad in tablet mode when touch remains available', () => {
    expect(getResponsiveViewportMode({ coarsePointer: false, anyCoarsePointer: true, screenWidth: 820, screenHeight: 1180 })).toBe('tablet-portrait')
  })

  it('keeps device mode when only split-window and keyboard bounds change', () => {
    Object.defineProperties(window.screen, {
      width: { configurable: true, value: 820 },
      height: { configurable: true, value: 1180 },
      orientation: { configurable: true, value: { type: 'portrait-primary' } },
    })
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === '(any-pointer: coarse)', addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const visual = new EventTarget()
    Object.assign(visual, { height: 900, offsetTop: 0 })
    vi.stubGlobal('visualViewport', visual)
    const wrapper = ({ children }: { children: ReactNode }) => <ResponsiveViewportProvider>{children}</ResponsiveViewportProvider>
    const { result, unmount } = renderHook(() => useResponsiveViewport(), { wrapper })
    act(() => {
      vi.stubGlobal('innerWidth', 375)
      Object.assign(visual, { height: 400, offsetTop: 20 })
      visual.dispatchEvent(new Event('resize'))
    })
    expect(result.current.mode).toBe('tablet-portrait')
    expect(result.current.viewportWidth).toBe(375)
    expect(result.current.visibleHeight).toBe(400)
    expect(result.current.visibleTop).toBe(20)
    unmount()
    vi.unstubAllGlobals()
    Object.defineProperty(window.screen, 'orientation', { configurable: true, value: undefined })
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
