import { useEffect, useState } from 'react'
import { useResponsiveViewport } from './ResponsiveViewportProvider'

export function useTabletWorkArea() {
  const [element, setElement] = useState<HTMLFormElement | null>(null)
  const { isTablet, viewportWidth, visibleHeight, visibleTop } = useResponsiveViewport()
  useEffect(() => {
    if (!element || !isTablet) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const top = Math.max(0, element.getBoundingClientRect().top - visibleTop)
        element.style.setProperty('--tablet-work-height', `${Math.max(120, visibleHeight - top - 16)}px`)
      })
    }
    update()
    const observer = new ResizeObserver(update)
    if (element.parentElement) observer.observe(element.parentElement)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      element.style.removeProperty('--tablet-work-height')
    }
  }, [element, isTablet, viewportWidth, visibleHeight, visibleTop])
  return setElement
}
