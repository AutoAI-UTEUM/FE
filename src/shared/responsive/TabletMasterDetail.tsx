import { ArrowLeft } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useElementWidth } from './useElementWidth'
import { useFocusScope } from './useFocusScope'

export function TabletMasterDetail({ children, detail, onClose, title, enabled = true, listLabel }: {
  listLabel?: string
  enabled?: boolean
  children: ReactNode
  detail: ReactNode
  onClose: () => void
  title: string
}) {
  const [measureArea, areaWidth] = useElementWidth()
  const panel = useRef<HTMLElement>(null)
  const wide = areaWidth >= 960
  useFocusScope(panel, enabled && Boolean(detail), onClose, false)
  if (!enabled) return <div role={listLabel ? 'region' : undefined} aria-label={listLabel} tabIndex={listLabel ? 0 : undefined} className="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]">{children}</div>
  return <div className="tablet-master-detail relative flex min-h-0 flex-1" ref={measureArea} onClickCapture={(event) => {
    // Safari does not focus buttons on a tap; remember the opener before mounting details.
    if (!detail) (event.target as HTMLElement).closest<HTMLElement>('button, a[href]')?.focus({ preventScroll: true })
  }}>
    <div role={listLabel ? 'region' : undefined} aria-label={listLabel} tabIndex={listLabel ? 0 : undefined} className={`${detail && !wide ? 'hidden' : ''} min-h-0 min-w-0 flex-1 overflow-auto`}>{children}</div>
    {detail ? <section aria-label={title} className={`${wide ? 'w-[380px] shrink-0 border-l border-stone-200' : 'w-full'} min-h-0 overflow-auto bg-white`} ref={panel} tabIndex={-1}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-stone-200 bg-white p-3">
        <button aria-label="목록으로 돌아가기" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100" onClick={onClose} type="button"><ArrowLeft aria-hidden="true" size={18} /></button>
        <h3 className="min-w-0 break-words type-section-title font-semibold">{title}</h3>
      </div>
      {detail}
    </section> : null}
  </div>
}
