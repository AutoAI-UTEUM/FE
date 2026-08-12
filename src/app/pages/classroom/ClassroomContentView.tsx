import { Bell, BookOpen, ClipboardList, FileText, MoreHorizontal, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { DragEvent } from 'react'

import { formatClassroomWeekPeriod, type ClassroomWeek } from '../../../features/classrooms'
import { Badge, Button, EmptyState } from '../../../shared/ui'
import type { ClassroomContentFilter, ClassroomContentItem } from './classroomContentModel'

type ResourceKey = 'exams' | 'notices' | 'weeks'

export function ClassroomContentRail({ endDate, onSelect, selectedWeekNumber, startDate, weeks }: {
  endDate: string
  onSelect: (weekNumber: number | null) => void
  selectedWeekNumber: number | null
  startDate: string
  weeks: ClassroomWeek[]
}) {
  return <aside className="flex min-h-0 flex-col rounded-lg border border-stone-200 bg-white">
    <nav aria-label="강의실 주차" className="flex-1 space-y-0.5 p-1.5">
      <button aria-current={selectedWeekNumber === null ? 'page' : undefined} className={railButtonClass(selectedWeekNumber === null)} onClick={() => onSelect(null)} type="button"><span className="flex size-6 items-center justify-center rounded-md bg-white text-stone-500 ring-1 ring-stone-200"><BookOpen size={13} /></span><strong className="min-w-0 flex-1 truncate text-left type-caption">전체 항목</strong></button>
      {weeks.map((week, index) => {
        const period = formatClassroomWeekPeriod(startDate, endDate, index + 1)
        return <button aria-current={selectedWeekNumber === week.weekNumber ? 'page' : undefined} className={weekRailButtonClass(selectedWeekNumber === week.weekNumber)} key={week.id} onClick={() => onSelect(week.weekNumber)} type="button"><strong className="min-w-0 truncate text-left type-caption">{week.title}</strong>{period ? <span className="text-left type-micro tabular-nums text-stone-400">{period}</span> : <span />}</button>
      })}
      {weeks.length === 0 ? <p className="px-3 py-8 text-center type-control text-stone-400">등록된 주차 없음</p> : null}
    </nav>
  </aside>
}

export function ClassroomContentPanel({
  canManage,
  draggingWeek,
  endDate,
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
  onRetry,
  openingMaterialId,
  selectedWeek,
  selectedWeekNumber,
  setDragging,
  startDate,
}: {
  canManage: boolean
  draggingWeek: number | null
  endDate: string
  errors: Partial<Record<ResourceKey, string>>
  filter: ClassroomContentFilter
  globalItems: ClassroomContentItem[]
  isUploading: boolean
  items: ClassroomContentItem[]
  onAdd: (kind: 'exam' | 'material' | 'notice') => void
  onDrop: (file: File) => void
  onFilter: (filter: ClassroomContentFilter) => void
  onItem: (item: ClassroomContentItem) => void
  onRemoveMaterial: (weekNumber: number, materialId: string, title: string) => Promise<void>
  onRetry: (key: ResourceKey) => void
  openingMaterialId: string | null
  selectedWeek?: ClassroomWeek
  selectedWeekNumber: number | null
  setDragging: (weekNumber: number | null) => void
  startDate: string
}) {
  const title = selectedWeekNumber === null ? '전체 콘텐츠' : selectedWeek?.title ?? ''
  const period = selectedWeekNumber === null || !selectedWeek
    ? ''
    : formatClassroomWeekPeriod(startDate, endDate, selectedWeek.displayOrder)

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

  return <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5" onDragLeave={() => setDragging(null)} onDragOver={dragOver} onDrop={drop}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="type-section-title font-bold text-stone-950">{title}</h2>
        {period ? <span className="type-caption tabular-nums text-stone-500">{period}</span> : null}
      </div>
      {canManage ? <AddItemButtons disabled={isUploading} onAdd={onAdd} /> : null}
    </div>

    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="콘텐츠 유형 필터">{([['all', '전체'], ['material', '자료'], ['notice', '공지'], ['exam', '시험']] as const).map(([value, label]) => <button aria-pressed={filter === value} className={`h-9 rounded-lg border px-3 type-control font-semibold ${filter === value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`} key={value} onClick={() => onFilter(value)} type="button">{label}</button>)}</div>

    {Object.entries(errors).map(([key, message]) => message ? <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3" key={key}><p className="type-control text-rose-800">{resourceLabel(key as ResourceKey)}을 불러오지 못했습니다. {message}</p><Button onClick={() => onRetry(key as ResourceKey)} size="sm" variant="secondary"><RefreshCw size={13} />재시도</Button></div> : null)}

    {globalItems.length > 0 ? <details className="border-y border-stone-200 py-2" open><summary className="flex min-h-10 cursor-pointer list-none items-center px-1"><span className="type-body font-bold text-stone-900">전체 항목</span></summary><div className="space-y-2 pt-2">{globalItems.map((item) => <ContentRow canManage={canManage} item={item} key={item.id} onItem={onItem} onRemoveMaterial={onRemoveMaterial} openingMaterialId={openingMaterialId} />)}</div></details> : null}

    <section aria-label={title} className={`space-y-2 rounded-lg transition ${draggingWeek === selectedWeekNumber && selectedWeekNumber !== null ? 'ring-2 ring-brand-100' : ''}`}>
      {items.length > 0 ? items.map((item) => <ContentRow canManage={canManage} item={item} key={item.id} onItem={onItem} onRemoveMaterial={onRemoveMaterial} openingMaterialId={openingMaterialId} />) : <EmptyState description="추가된 항목이 없습니다." title="항목 없음" />}
    </section>
  </div>
}

function ContentRow({ canManage, item, onItem, onRemoveMaterial, openingMaterialId }: {
  canManage: boolean
  item: ClassroomContentItem
  onItem: (item: ClassroomContentItem) => void
  onRemoveMaterial: (weekNumber: number, materialId: string, title: string) => Promise<void>
  openingMaterialId: string | null
}) {
  const values = contentType(item)
  return <div className="flex min-h-14 items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-2.5 hover:bg-stone-50/70">
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${values.iconClass}`}><values.Icon size={16} /></span>
    <button className="min-w-0 flex-1 text-left" disabled={item.kind === 'material' && item.source.status !== 'READY'} onClick={() => onItem(item)} type="button"><span className="flex flex-wrap items-center gap-2"><strong className="break-words type-body font-bold text-stone-950">{displayTitle(item.title)}</strong><Badge tone={values.tone}>{values.label}</Badge>{item.kind === 'notice' ? <Badge tone={item.source.published ? 'success' : 'warning'}>{item.source.published ? '게시됨' : '예약'}</Badge> : null}{item.kind === 'exam' ? <Badge tone={item.source.status === 'PUBLISHED' ? 'success' : item.source.status === 'CLOSED' ? 'warning' : 'neutral'}>{item.source.status === 'PUBLISHED' ? '공개' : item.source.status === 'CLOSED' ? '종료' : '초안'}</Badge> : null}</span></button>
    {item.kind === 'material' && openingMaterialId === item.source.id ? <span className="type-caption text-brand-700">PDF 여는 중</span> : null}
    {canManage && item.kind === 'material' ? <button aria-label={`${item.title} 제거`} className="flex size-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-700" onClick={() => void onRemoveMaterial(item.weekNumber, item.source.id, item.title)} type="button"><Trash2 size={14} /></button> : null}
    <MoreHorizontal className="shrink-0 text-stone-300" size={16} />
  </div>
}

function AddItemButtons({ disabled, onAdd }: { disabled: boolean; onAdd: (kind: 'exam' | 'material' | 'notice') => void }) {
  const items = [
    ['material', Upload, '자료 추가'],
    ['notice', Bell, '공지 추가'],
    ['exam', ClipboardList, '시험 추가'],
  ] as const

  return <div aria-label="새 항목 유형" className="flex flex-wrap items-center gap-2" role="group">
    {items.map(([kind, Icon, label], index) => <Button disabled={disabled} key={kind} onClick={() => onAdd(kind)} size="sm" variant={index === 0 ? 'primary' : 'secondary'}><Icon size={14} />{label}</Button>)}
  </div>
}

function contentType(item: ClassroomContentItem) {
  if (item.kind === 'material') return { Icon: FileText, iconClass: 'bg-rose-50 text-rose-700', label: '자료', tone: 'danger' as const }
  if (item.kind === 'notice') return { Icon: Bell, iconClass: 'bg-amber-50 text-amber-700', label: '공지', tone: 'warning' as const }
  return { Icon: ClipboardList, iconClass: 'bg-brand-50 text-brand-700', label: '시험', tone: 'info' as const }
}

function displayTitle(value: string): string {
  return value.replace(/\.(pdf|pptx?)$/i, '')
}

function resourceLabel(key: ResourceKey): string {
  return key === 'weeks' ? '자료' : key === 'notices' ? '공지' : '시험'
}

function railButtonClass(selected: boolean): string {
  return `flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 ${selected ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-50'}`
}

function weekRailButtonClass(selected: boolean): string {
  return `grid h-8 w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-2 rounded-md px-2 ${selected ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-50'}`
}
