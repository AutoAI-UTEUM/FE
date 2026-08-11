import { Bold, Eye, Italic, Link, List, ListOrdered, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'

import { cx } from '../lib/cx'
import { MarkdownContent } from './MarkdownContent'

interface MarkdownEditorProps {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  maxLength?: number
  onChange: (value: string) => void
  placeholder?: string
  value: string
}

type InlineFormat = {
  fallback: string
  prefix: string
  suffix: string
}

export function MarkdownEditor({
  ariaLabel,
  className,
  disabled = false,
  maxLength,
  onChange,
  placeholder,
  value,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  function applyInlineFormat({ fallback, prefix, suffix }: InlineFormat) {
    const textarea = textareaRef.current
    if (!textarea || disabled) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.slice(start, end) || fallback
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`
    onChange(next)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    })
  }

  function applyLinePrefix(prefix: string) {
    const textarea = textareaRef.current
    if (!textarea || disabled) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const selectionEnd = end > start ? end : value.indexOf('\n', start)
    const lineEnd = selectionEnd === -1 ? value.length : selectionEnd
    const selected = value.slice(lineStart, lineEnd) || '목록 항목'
    const formatted = selected.split('\n').map((line) => `${prefix}${line}`).join('\n')
    onChange(`${value.slice(0, lineStart)}${formatted}${value.slice(lineEnd)}`)
    window.requestAnimationFrame(() => textarea.focus())
  }

  return (
    <div className={cx('flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-stone-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100', className)}>
      <div className="flex min-h-10 flex-wrap items-center gap-1 border-b border-stone-200 bg-stone-50 px-2">
        <FormatButton disabled={disabled || mode === 'preview'} icon={Bold} label="굵게" onClick={() => applyInlineFormat({ fallback: '굵은 텍스트', prefix: '**', suffix: '**' })} />
        <FormatButton disabled={disabled || mode === 'preview'} icon={Italic} label="기울임" onClick={() => applyInlineFormat({ fallback: '기울임 텍스트', prefix: '_', suffix: '_' })} />
        <FormatButton disabled={disabled || mode === 'preview'} icon={List} label="글머리 목록" onClick={() => applyLinePrefix('- ')} />
        <FormatButton disabled={disabled || mode === 'preview'} icon={ListOrdered} label="번호 목록" onClick={() => applyLinePrefix('1. ')} />
        <FormatButton disabled={disabled || mode === 'preview'} icon={Link} label="링크" onClick={() => applyInlineFormat({ fallback: '링크 제목', prefix: '[', suffix: '](https://)' })} />
        <div className="ml-auto flex items-center rounded-md border border-stone-200 bg-white p-0.5" role="group" aria-label="본문 보기 방식">
          <ModeButton active={mode === 'edit'} icon={Pencil} label="편집" onClick={() => setMode('edit')} />
          <ModeButton active={mode === 'preview'} icon={Eye} label="미리보기" onClick={() => setMode('preview')} />
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea
          aria-label={ariaLabel}
          className="min-h-64 flex-1 resize-none bg-white px-3.5 py-3 type-body leading-6 outline-none disabled:bg-stone-50"
          disabled={disabled}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          ref={textareaRef}
          value={value}
        />
      ) : (
        <div className="min-h-64 flex-1 overflow-y-auto px-3.5 py-3 text-stone-800">
          {value.trim() ? <MarkdownContent content={value} /> : <p className="type-body text-stone-400">미리볼 내용이 없습니다.</p>}
        </div>
      )}
    </div>
  )
}

function FormatButton({ disabled, icon: Icon, label, onClick }: { disabled: boolean; icon: typeof Bold; label: string; onClick: () => void }) {
  return <button aria-label={label} className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-white hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onClick} title={label} type="button"><Icon aria-hidden="true" size={14} /></button>
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Eye; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={cx('flex h-7 items-center gap-1.5 rounded px-2 type-caption font-semibold', active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50')} onClick={onClick} type="button"><Icon aria-hidden="true" size={13} />{label}</button>
}
