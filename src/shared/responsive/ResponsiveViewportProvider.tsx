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
  viewportWidth: number
  visibleHeight: number
  visibleTop: number
}

interface ViewportSnapshot {
  coarsePointer: boolean
  anyCoarsePointer?: boolean
  portraitOrientation?: boolean
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
  viewportWidth: 1280,
  visibleHeight: 800,
  visibleTop: 0,
}

const ResponsiveViewportContext = createContext<ResponsiveViewportValue>(desktopViewport)

export function getResponsiveViewportMode({
  coarsePointer,
  anyCoarsePointer,
  portraitOrientation,
  screenHeight,
  screenWidth,
}: ViewportSnapshot): ResponsiveViewportMode {
  const shortEdge = Math.min(screenWidth, screenHeight)
  const longEdge = Math.max(screenWidth, screenHeight)

  if (!(coarsePointer || anyCoarsePointer) || longEdge > MAX_MOBILE_LONG_EDGE) return 'desktop'
  if (shortEdge <= MAX_PHONE_SHORT_EDGE) return 'phone'
  const isPortrait = portraitOrientation ?? screenHeight >= screenWidth
  return isPortrait ? 'tablet-portrait' : 'tablet-landscape'
}

function readViewportMode(): ResponsiveViewportMode {
  if (typeof window === 'undefined') return 'desktop'
  const screenWidth = window.screen.width || window.innerWidth
  const screenHeight = window.screen.height || window.innerHeight
  return getResponsiveViewportMode({
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    anyCoarsePointer: window.matchMedia?.('(any-pointer: coarse)').matches ?? false,
    // Screen orientation is independent of the keyboard and split-window aspect ratio.
    portraitOrientation: window.screen.orientation?.type
      ? window.screen.orientation.type.startsWith('portrait')
      : screenHeight >= screenWidth,
    screenHeight,
    screenWidth,
  })
}

export function ResponsiveViewportProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ResponsiveViewportMode>(readViewportMode)
  const [viewport, setViewport] = useState(readViewport)

  useEffect(() => {
    const pointerQuery = window.matchMedia?.('(pointer: coarse)')
    const anyPointerQuery = window.matchMedia?.('(any-pointer: coarse)')
    const orientationQuery = window.matchMedia?.('(orientation: portrait)')
    const update = () => {
      setMode(readViewportMode())
      setViewport((previous) => {
        const next = readViewport()
        return previous.viewportWidth === next.viewportWidth && previous.visibleHeight === next.visibleHeight
          && previous.visibleTop === next.visibleTop ? previous : next
      })
    }

    pointerQuery?.addEventListener('change', update)
    anyPointerQuery?.addEventListener('change', update)
    window.screen.orientation?.addEventListener?.('change', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    orientationQuery?.addEventListener('change', update)
    window.addEventListener('orientationchange', update)
    window.addEventListener('resize', update)
    update()

    return () => {
      pointerQuery?.removeEventListener('change', update)
      anyPointerQuery?.removeEventListener('change', update)
      window.screen.orientation?.removeEventListener?.('change', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      orientationQuery?.removeEventListener('change', update)
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--visible-height', `${viewport.visibleHeight}px`)
    root.style.setProperty('--visible-top', `${viewport.visibleTop}px`)
    return () => {
      root.style.removeProperty('--visible-height')
      root.style.removeProperty('--visible-top')
    }
  }, [viewport])

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
    ...viewport,
  }), [mode, viewport])

  return (
    <ResponsiveViewportContext.Provider value={value}>
      {children}
    </ResponsiveViewportContext.Provider>
  )
}

function readViewport() {
  if (typeof window === 'undefined') return { viewportWidth: 1280, visibleHeight: 800, visibleTop: 0 }
  return {
    viewportWidth: window.innerWidth,
    visibleHeight: Math.round(window.visualViewport?.height ?? window.innerHeight),
    visibleTop: Math.round(window.visualViewport?.offsetTop ?? 0),
  }
}

export function useResponsiveViewport(): ResponsiveViewportValue {
  return useContext(ResponsiveViewportContext)
}
