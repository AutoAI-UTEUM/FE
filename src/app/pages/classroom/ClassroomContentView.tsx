import { Bell, BookOpen, ClipboardList, LoaderCircle, MoreHorizontal, RefreshCw, Upload } from 'lucide-react'
import { useState, type DragEvent } from 'react'

import { formatClassroomWeekPeriod, type ClassroomWeek } from '../../../features/classrooms'
import { useResponsiveViewport } from '../../../shared/responsive'
import { Badge, Button, EmptyState } from '../../../shared/ui'
import type { ClassroomContentFilter, ClassroomContentItem } from './classroomContentModel'

type ResourceKey = 'exams' | 'notices' | 'resources' | 'weeks'

export function ClassroomContentRail({ endDate, onSelect, selectedWeekNumber, startDate, weeks }: {
  endDate: string
  onSelect: (weekNumber: number | null) => void
  selectedWeekNumber: number | null
  startDate: string
  weeks: ClassroomWeek[]
}) {
  const { isPhone } = useResponsiveViewport()
  if (isPhone) {
    return (
      <section aria-label="강의실 주차 선택" className="rounded-lg border border-stone-200 bg-white p-3">
        <label className="block type-control font-semibold text-stone-700" htmlFor="mobile-classroom-week">
          주차
        </label>
        <select
          className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-stone-900"
          id="mobile-classroom-week"
          onChange={(event) => onSelect(event.target.value === 'all' ? null : Number(event.target.value))}
          value={selectedWeekNumber ?? 'all'}
        >
          <option value="all">전체 항목</option>
          {weeks.map((week) => {
            const period = formatClassroomWeekPeriod(startDate, endDate, week.weekNumber)
            return <option key={week.id} value={week.weekNumber}>{week.title}{period ? ` · ${period}` : ''}</option>
          })}
        </select>
      </section>
    )
  }
  return <aside className="flex min-h-0 flex-col rounded-lg border border-stone-200 bg-white lg:h-full lg:overflow-hidden tablet-portrait:h-full tablet-portrait:overflow-hidden tablet-landscape:h-full tablet-landscape:overflow-hidden">
    <nav aria-label="강의실 주차" className="min-h-0 flex-1 space-y-0.5 px-1.5 py-3 lg:overflow-y-auto tablet-portrait:overflow-y-auto tablet-landscape:overflow-y-auto">
      <button aria-current={selectedWeekNumber === null ? 'page' : undefined} className={railButtonClass(selectedWeekNumber === null)} onClick={() => onSelect(null)} type="button"><span className="flex size-6 items-center justify-center rounded-md bg-white text-stone-500 ring-1 ring-stone-200"><BookOpen size={13} /></span><strong className="min-w-0 flex-1 truncate text-left type-caption">전체 항목</strong></button>
      {weeks.map((week) => {
        const period = formatClassroomWeekPeriod(startDate, endDate, week.weekNumber)
        return <button aria-current={selectedWeekNumber === week.weekNumber ? 'page' : undefined} className={weekRailButtonClass(selectedWeekNumber === week.weekNumber)} key={week.id} onClick={() => onSelect(week.weekNumber)} type="button"><strong className="min-w-0 truncate text-left type-caption">{week.title}</strong>{period ? <span className="whitespace-nowrap text-right type-micro tabular-nums text-stone-400">{period}</span> : <span />}</button>
      })}
      {weeks.length === 0 ? <p className="px-3 py-8 text-center type-control text-stone-400">등록된 주차 없음</p> : null}
    </nav>
  </aside>
}

export function ClassroomContentPanel({
  canManage,
  draggingWeek,
  errors,
  filter,
  globalItems,
  isUploading,
  items,
  onAdd,
  onDrop,
  onFilter,
  onItem,
  onRemoveMaterial,
  onRenameMaterial,
  onRetry,
  openingMaterialId,
  processingMaterialTitle,
  selectedWeek,
  selectedWeekNumber,
  setDragging,
}: {
  canManage: boolean
  draggingWeek: number | null
  errors: Partial<Record<ResourceKey, string>>
  filter: ClassroomContentFilter
  globalItems: ClassroomContentItem[]
  isUploading: boolean
  items: ClassroomContentItem[]
  onAdd: (kind: 'exam' | 'material' | 'notice' | 'resource') => void
  onDrop: (file: File) => void
  onFilter: (filter: ClassroomContentFilter) => void
  onItem: (item: ClassroomContentItem) => void
  onRemoveMaterial: (weekNumber: number, materialId: string, title: string) => Promise<void>
  onRenameMaterial: (material: { id: string; title: string }) => void
  onRetry: (key: ResourceKey) => void
  openingMaterialId: string | null
  processingMaterialTitle: string | null
  selectedWeek?: ClassroomWeek
  selectedWeekNumber: number | null
  setDragging: (weekNumber: number | null) => void
}) {
  const title = selectedWeekNumber === null ? '전체 콘텐츠' : selectedWeek?.title ?? ''
  const [openMenuItemId, setOpenMenuItemId] = useState<string | null>(null)

  function dragOver(event: DragEvent<HTMLElement>) {
    if (!canManage || selectedWeekNumber === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(selectedWeekNumber)
  }

  function drop(event: DragEvent<HTMLElement>) {
    if (!canManage || selectedWeekNumber === null) return
    event.preventDefault()
    setDragging(null)
    const file = event.dataTransfer.files[0]
    if (file) onDrop(file)
  }

  return <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-3 lg:h-full lg:min-h-0 lg:overflow-hidden tablet-portrait:h-full tablet-portrait:min-h-0 tablet-portrait:overflow-hidden tablet-landscape:h-full tablet-landscape:min-h-0 tablet-landscape:overflow-hidden" onDragLeave={() => setDragging(null)} onDragOver={dragOver} onDrop={drop}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mobile-phone:items-stretch">
      <ContentFilterButtons filter={filter} onFilter={onFilter} />
      {canManage ? <AddItemButtons disabled={isUploading} onAdd={onAdd} /> : null}
    </div>

    {Object.entries(errors).map(([key, message]) => message ? <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3" key={key}><p className="type-control text-rose-800">{resourceLabel(key as ResourceKey)}을 불러오지 못했습니다. {message}</p><Button onClick={() => onRetry(key as ResourceKey)} size="sm" variant="secondary"><RefreshCw size={13} />재시도</Button></div> : null)}

    <div aria-label="리소스 목록" className="min-h-0 flex-1 space-y-2 lg:overflow-y-auto tablet-portrait:overflow-y-auto tablet-landscape:overflow-y-auto" role="region">
      {globalItems.length > 0
        ? filter === 'all' || filter === 'notice'
          ? <div className="space-y-2">{globalItems.map((item) => <ContentRow canManage={canManage} isMenuOpen={openMenuItemId === item.id} item={item} key={item.id} onItem={onItem} onMenuToggle={() => setOpenMenuItemId((current) => current === item.id ? null : item.id)} onRemoveMaterial={onRemoveMaterial} onRenameMaterial={onRenameMaterial} openingMaterialId={openingMaterialId} />)}</div>
          : <details className="border-y border-stone-200 py-2" open><summary className="flex min-h-10 cursor-pointer list-none items-center px-1"><span className="type-body font-bold text-stone-900">전체 항목</span></summary><div className="space-y-2 pt-2">{globalItems.map((item) => <ContentRow canManage={canManage} isMenuOpen={openMenuItemId === item.id} item={item} key={item.id} onItem={onItem} onMenuToggle={() => setOpenMenuItemId((current) => current === item.id ? null : item.id)} onRemoveMaterial={onRemoveMaterial} onRenameMaterial={onRenameMaterial} openingMaterialId={openingMaterialId} />)}</div></details>
        : null}

      <section aria-label={title} className={`space-y-2 rounded-lg transition ${draggingWeek === selectedWeekNumber && selectedWeekNumber !== null ? 'ring-2 ring-brand-100' : ''}`}>
        {processingMaterialTitle ? <div className="flex min-h-14 items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5" role="status"><LoaderCircle aria-hidden="true" className="shrink-0 animate-spin text-brand-700" size={18} /><div className="min-w-0"><p className="type-body font-bold text-brand-900">수업을 생성하는 중입니다</p><p className="truncate type-caption text-brand-700">{displayTitle(processingMaterialTitle)} · 완료되면 목록에 표시됩니다.</p></div></div> : null}
        {items.length > 0 ? items.map((item) => <ContentRow canManage={canManage} isMenuOpen={openMenuItemId === item.id} item={item} key={item.id} onItem={onItem} onMenuToggle={() => setOpenMenuItemId((current) => current === item.id ? null : item.id)} onRemoveMaterial={onRemoveMaterial} onRenameMaterial={onRenameMaterial} openingMaterialId={openingMaterialId} />) : processingMaterialTitle || globalItems.length > 0 ? null : <EmptyState description="추가된 항목이 없습니다." title="항목 없음" />}
      </section>
    </div>
  </div>
}

function ContentRow({ canManage, isMenuOpen, item, onItem, onMenuToggle, onRemoveMaterial, onRenameMaterial, openingMaterialId }: {
  canManage: boolean
  isMenuOpen: boolean
  item: ClassroomContentItem
  onItem: (item: ClassroomContentItem) => void
  onMenuToggle: () => void
  onRemoveMaterial: (weekNumber: number, materialId: string, title: string) => Promise<void>
  onRenameMaterial: (material: { id: string; title: string }) => void
  openingMaterialId: string | null
}) {
  return <div className="flex h-11 min-h-11 items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 hover:bg-stone-50/70 mobile-web:h-12 mobile-web:min-h-12 mobile-phone:px-3">
    {item.kind === 'material'
      ? <Badge size="compact" tone="info">수업</Badge>
      : item.kind === 'resource'
        ? <Badge size="compact" tone="danger">자료</Badge>
      : item.kind === 'notice'
        ? <Badge size="compact" tone="warning">공지</Badge>
        : <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><ClipboardList aria-hidden="true" size={16} /></span>}
    <button className="min-w-0 flex-1 overflow-hidden text-left" disabled={item.kind === 'material' && item.source.status !== 'READY'} onClick={() => onItem(item)} type="button">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <strong className="min-w-0 max-w-full truncate type-body font-bold text-stone-950">{displayTitle(item.title)}</strong>
        {item.kind === 'notice' && !item.source.published ? <Badge size="compact" tone="warning">예약</Badge> : null}
        {item.kind === 'exam' ? <span className="flex shrink-0 items-center gap-1.5"><Badge size="compact" tone="info">시험</Badge><Badge size="compact" tone={item.source.status === 'PUBLISHED' ? 'success' : item.source.status === 'CLOSED' ? 'warning' : 'neutral'}>{item.source.status === 'PUBLISHED' ? '공개' : item.source.status === 'CLOSED' ? '종료' : '초안'}</Badge></span> : null}
      </span>
    </button>
    {item.kind === 'material' && openingMaterialId === item.source.id ? <span className="type-caption text-brand-700">수업 여는 중</span> : null}
    {canManage && item.kind === 'material' ? <div className="relative shrink-0"><button aria-expanded={isMenuOpen} aria-label={`${item.title} 작업 메뉴`} className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 mobile-web:size-11" onClick={onMenuToggle} type="button"><MoreHorizontal size={16} /></button>{isMenuOpen ? <div className="absolute top-11 right-0 z-20 w-32 rounded-lg border border-stone-200 bg-white p-1 shadow-lg" role="menu"><button className="block h-10 w-full rounded px-2 text-left type-caption font-semibold text-stone-700 hover:bg-stone-50" onClick={() => { onMenuToggle(); onRenameMaterial({ id: item.source.id, title: item.title }) }} role="menuitem" type="button">이름 변경</button><button className="block h-10 w-full rounded px-2 text-left type-caption font-semibold text-rose-700 hover:bg-rose-50" onClick={() => { onMenuToggle(); void onRemoveMaterial(item.weekNumber, item.source.id, item.title) }} role="menuitem" type="button">주차에서 제거</button></div> : null}</div> : <span className="flex size-8 shrink-0 items-center justify-center mobile-web:size-11"><MoreHorizontal className="text-stone-300" size={16} /></span>}
  </div>
}

function ContentFilterButtons({ filter, onFilter }: {
  filter: ClassroomContentFilter
  onFilter: (filter: ClassroomContentFilter) => void
}) {
  const filters = [
    ['all', '전체'],
    ['material', '수업'],
    ['resource', '자료'],
    ['notice', '공지'],
    ['exam', '시험'],
  ] as const

  return <div className="mobile-horizontal-scroll flex flex-wrap items-center gap-2 mobile-phone:flex-nowrap mobile-phone:overflow-x-auto" role="group" aria-label="콘텐츠 유형 필터">
    {filters.map(([value, label]) => <button aria-pressed={filter === value} className={`h-9 min-h-9 shrink-0 rounded-lg border px-3 type-control font-semibold mobile-web:h-11 mobile-web:min-h-11 ${filter === value ? 'border-transparent bg-brand-50 text-brand-800' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`} key={value} onClick={() => onFilter(value)} type="button">{label}</button>)}
  </div>
}

function AddItemButtons({ disabled, onAdd }: { disabled: boolean; onAdd: (kind: 'exam' | 'material' | 'notice' | 'resource') => void }) {
  const items = [
    ['material', BookOpen, '수업 생성'],
    ['resource', Upload, '자료 업로드'],
    ['notice', Bell, '공지 추가'],
    ['exam', ClipboardList, '시험 추가'],
  ] as const

  return <div aria-label="새 항목 유형" className="mobile-horizontal-scroll flex flex-wrap items-center gap-2 sm:ml-auto mobile-phone:flex-nowrap mobile-phone:overflow-x-auto" role="group">
    {items.map(([kind, Icon, label], index) => <Button className="h-9 min-h-9 shrink-0" disabled={disabled} key={kind} onClick={() => onAdd(kind)} size="sm" variant={index === 0 ? 'primary' : 'secondary'}><Icon size={14} />{label}</Button>)}
  </div>
}

function displayTitle(value: string): string {
  return value.replace(/\.(pdf|pptx?)$/i, '')
}

function resourceLabel(key: ResourceKey): string {
  if (key === 'weeks') return '수업'
  if (key === 'notices') return '공지'
  if (key === 'resources') return '일반 자료'
  return '시험'
}

function railButtonClass(selected: boolean): string {
  return `flex h-9 min-h-9 w-full items-center gap-1.5 rounded-md px-1.5 ${selected ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-50'}`
}

function weekRailButtonClass(selected: boolean): string {
  return `grid h-10 w-full grid-cols-[minmax(0,1fr)_96px] items-center gap-2 rounded-md px-2 ${selected ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-50'}`
}
