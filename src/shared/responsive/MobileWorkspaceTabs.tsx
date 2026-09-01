import { cx } from '../lib/cx'

export function MobileWorkspaceTabs<T extends string>({
  active,
  items,
  onChange,
}: {
  active: T
  items: Array<{ label: string; value: T }>
  onChange: (value: T) => void
}) {
  return (
    <div
      aria-label="작업 화면"
      className="hidden shrink-0 border-b border-stone-200 bg-white p-2 mobile-phone:block mobile-safe-top"
      role="tablist"
    >
      <div className="grid grid-cols-2 rounded-lg bg-stone-100 p-1">
        {items.map((item) => (
          <button
            aria-selected={active === item.value}
            className={cx(
              'min-h-11 rounded-md px-3 type-control font-semibold transition-colors',
              active === item.value
                ? 'bg-white text-stone-950 shadow-sm'
                : 'text-stone-500',
            )}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
