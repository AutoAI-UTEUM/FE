import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as viewport from './ResponsiveViewportProvider'
import { useTabletWorkArea } from './useTabletWorkArea'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('fits editing actions below the header and updates when the keyboard appears', () => {
  const value: viewport.ResponsiveViewportValue = { isTablet: true, isPhone: false, isMobileWeb: true, mode: 'tablet-portrait', viewportWidth: 820, visibleHeight: 900, visibleTop: 0 }
  vi.spyOn(viewport, 'useResponsiveViewport').mockImplementation(() => value)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  function Editor() { const ref = useTabletWorkArea(); return <form aria-label="Editor" ref={ref} /> }
  const { rerender } = render(<Editor />)
  expect(screen.getByRole('form').style.getPropertyValue('--tablet-work-height')).toBe('684px')
  value.visibleHeight = 420
  rerender(<Editor />)
  expect(screen.getByRole('form').style.getPropertyValue('--tablet-work-height')).toBe('204px')
  value.isTablet = false
  rerender(<Editor />)
  expect(screen.getByRole('form').style.getPropertyValue('--tablet-work-height')).toBe('')
})
