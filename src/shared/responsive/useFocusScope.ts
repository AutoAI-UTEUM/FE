import { useEffect, useRef, type RefObject } from 'react'

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

export function useFocusScope(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void, trap = true) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!active || !ref.current) return
    const container = ref.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const items = () => Array.from(container.querySelectorAll<HTMLElement>(focusable))
      .filter((element) => element.getClientRects().length > 0)
    ;(container.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? container).focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || !trap) return
      const nodes = items()
      if (!nodes.length) { event.preventDefault(); container.focus(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    container.addEventListener('keydown', handleKey)
    return () => {
      container.removeEventListener('keydown', handleKey)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active, ref, trap])
}
