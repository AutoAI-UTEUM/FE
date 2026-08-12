import { PanelLeftClose } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cx } from '../../shared/lib/cx'

export interface SessionResourceMaterial {
  id: string
  sessionId?: string
  status: 'PROCESSING' | 'READY' | 'FAILED'
  title: string
}

export interface SessionResourceWeek {
  id: string
  materials: SessionResourceMaterial[]
  title: string
}

interface SessionResourcePanelProps {
  activeMaterialId?: string
  onClose: () => void
  resourcePath: (material: SessionResourceMaterial) => string
  weeks: SessionResourceWeek[]
}

export function SessionResourcePanel({
  activeMaterialId,
  onClose,
  resourcePath,
  weeks,
}: SessionResourcePanelProps) {
  return (
    <aside className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-stone-200 bg-stone-50/60 p-3 xl:flex">
      <div className="flex justify-end">
        <button
          aria-label="자료 목록 닫기"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-white hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          onClick={onClose}
          title="자료 목록 닫기"
          type="button"
        >
          <PanelLeftClose aria-hidden="true" size={15} />
        </button>
      </div>

      <div className="mt-3.5 grid min-w-0 w-full max-w-full gap-2">
        {weeks.map((week, index) => (
          <section
            className="min-w-0 w-full max-w-full overflow-hidden"
            key={week.id}
          >
            <div className="grid min-w-0 w-full max-w-full grid-cols-[40px_minmax(0,1fr)] items-baseline gap-1.5 overflow-hidden px-2 py-1">
              <span className="whitespace-nowrap type-caption font-bold tabular-nums text-stone-700">
                {index + 1}주차
              </span>
              <h2
                className="min-w-0 truncate type-caption font-bold text-stone-700"
                title={week.title}
              >
                {week.title}
              </h2>
            </div>
            <ul className="grid min-w-0 w-full max-w-full gap-0.5">
              {week.materials.map((material) => (
                <li className="min-w-0 w-full max-w-full" key={material.id}>
                  <ResourceRow
                    isActive={material.id === activeMaterialId}
                    isMuted={material.status !== 'READY'}
                    to={resourcePath(material)}
                    title={material.title}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {weeks.length === 0 ? (
          <p className="px-2 py-1.5 type-caption text-stone-400">
            현재 강의실의 자료를 찾을 수 없습니다.
          </p>
        ) : null}
      </div>

    </aside>
  )
}

function ResourceRow({
  isActive = false,
  isMuted = false,
  title,
  to,
}: {
  isActive?: boolean
  isMuted?: boolean
  title: string
  to: string
}) {
  return (
    <Link
      className={cx(
        'flex min-h-8.5 min-w-0 w-full max-w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 type-control',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        isActive
          ? 'bg-white font-semibold text-stone-900 shadow-sm'
          : isMuted
            ? 'text-stone-400 hover:bg-white'
            : 'text-stone-600 hover:bg-white hover:text-stone-900',
      )}
      to={to}
    >
      <span
        className={cx(
          'flex h-5 w-8 shrink-0 items-center justify-center self-center rounded type-micro font-bold leading-none',
          getMaterialKind(title) === 'PPT'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-rose-100 text-rose-700',
        )}
      >
        {getMaterialKind(title)}
      </span>
      <span
        className="block min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap leading-5"
        title={title}
      >
        {title}
      </span>
    </Link>
  )
}

function getMaterialKind(title: string): 'PDF' | 'PPT' {
  return /\.pptx?$/i.test(title.trim()) ? 'PPT' : 'PDF'
}
