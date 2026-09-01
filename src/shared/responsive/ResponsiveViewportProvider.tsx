/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ResponsiveViewportMode =
  | 'desktop'
  | 'phone'
  | 'tablet-portrait'
  | 'tablet-landscape'

export interface ResponsiveViewportValue {
  isMobileWeb: boolean
  isPhone: boolean
  isTablet: boolean
  mode: ResponsiveViewportMode
}

interface ViewportSnapshot {
  coarsePointer: boolean
  screenHeight: number
  screenWidth: number
}

const MAX_MOBILE_LONG_EDGE = 1366
const MAX_PHONE_SHORT_EDGE = 599

const desktopViewport: ResponsiveViewportValue = {
  isMobileWeb: false,
  isPhone: false,
  isTablet: false,
  mode: 'desktop',
}

const ResponsiveViewportContext = createContext<ResponsiveViewportValue>(desktopViewport)

export function getResponsiveViewportMode({
  coarsePointer,
  screenHeight,
  screenWidth,
}: ViewportSnapshot): ResponsiveViewportMode {
  const shortEdge = Math.min(screenWidth, screenHeight)
  const longEdge = Math.max(screenWidth, screenHeight)

  if (!coarsePointer || longEdge > MAX_MOBILE_LONG_EDGE) return 'desktop'
  if (shortEdge <= MAX_PHONE_SHORT_EDGE) return 'phone'
  return screenHeight >= screenWidth ? 'tablet-portrait' : 'tablet-landscape'
}

function readViewportMode(): ResponsiveViewportMode {
  if (typeof window === 'undefined') return 'desktop'
  const screenWidth = window.screen.width || window.innerWidth
  const screenHeight = window.screen.height || window.innerHeight
  return getResponsiveViewportMode({
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    screenHeight,
    screenWidth,
  })
}

export function ResponsiveViewportProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ResponsiveViewportMode>(readViewportMode)

  useEffect(() => {
    const pointerQuery = window.matchMedia?.('(pointer: coarse)')
    const orientationQuery = window.matchMedia?.('(orientation: portrait)')
    const update = () => setMode(readViewportMode())

    pointerQuery?.addEventListener('change', update)
    orientationQuery?.addEventListener('change', update)
    window.addEventListener('orientationchange', update)
    window.addEventListener('resize', update)
    update()

    return () => {
      pointerQuery?.removeEventListener('change', update)
      orientationQuery?.removeEventListener('change', update)
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.responsiveMode = mode
    root.classList.toggle('mobile-web', mode !== 'desktop')
    return () => {
      delete root.dataset.responsiveMode
      root.classList.remove('mobile-web')
    }
  }, [mode])

  const value = useMemo<ResponsiveViewportValue>(() => ({
    isMobileWeb: mode !== 'desktop',
    isPhone: mode === 'phone',
    isTablet: mode === 'tablet-portrait' || mode === 'tablet-landscape',
    mode,
  }), [mode])

  return (
    <ResponsiveViewportContext.Provider value={value}>
      {children}
    </ResponsiveViewportContext.Provider>
  )
}

export function useResponsiveViewport(): ResponsiveViewportValue {
  return useContext(ResponsiveViewportContext)
}
