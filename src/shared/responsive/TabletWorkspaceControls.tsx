import { Columns2, PanelLeft, PanelRight } from 'lucide-react'

export type TabletPane = 'both' | 'content' | 'learning'

export function TabletWorkspaceControls({ value, onChange, canSplit, contentLabel = '자료', learningLabel = '학습' }: {
  value: TabletPane
  onChange: (value: TabletPane) => void
  canSplit: boolean
  contentLabel?: string
  learningLabel?: string
}) {
  const items = [
    { value: 'content' as const, label: contentLabel, Icon: PanelLeft },
    { value: 'learning' as const, label: learningLabel, Icon: PanelRight },
    ...(canSplit ? [{ value: 'both' as const, label: '함께 보기', Icon: Columns2 }] : []),
  ]
  return <div aria-label="학습 화면 보기" className="flex shrink-0 flex-wrap items-center gap-1 border-b border-stone-200 bg-white p-2" role="group">
    {items.map(({ value: pane, label, Icon }) => <button aria-pressed={value === pane} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 type-control font-semibold ${value === pane ? 'bg-brand-50 text-brand-700' : 'text-stone-500 hover:bg-stone-50'}`} key={pane} onClick={() => onChange(pane)} type="button"><Icon aria-hidden="true" size={18} />{label}</button>)}
  </div>
}
