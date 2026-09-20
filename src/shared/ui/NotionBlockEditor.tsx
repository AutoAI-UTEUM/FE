import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  type Block,
} from '@blocknote/core'
import { ko } from '@blocknote/core/locales'
import {
  filterSuggestionItems,
  SuggestionMenu as SuggestionMenuExtension,
} from '@blocknote/core/extensions'
import '@blocknote/core/fonts/inter.css'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import {
  type DefaultReactGridSuggestionItem,
  getDefaultReactEmojiPickerItems,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useBlockNoteEditor,
  useCreateBlockNote,
  useExtension,
} from '@blocknote/react'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cx } from '../lib/cx'
import { useTheme } from '../theme'
import { filterNoteSlashMenuItems } from './noteSlashMenu'
import './NotionBlockEditor.css'

interface NotionBlockEditorProps {
  ariaLabel?: string
  className?: string
  initialDocument?: string
  initialValue: string
  onChange: (markdown: string, document: string) => void
}

const codeLanguages = {
  text: { name: '일반 텍스트', aliases: ['txt', 'plain'] },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  python: { name: 'Python', aliases: ['py'] },
  java: { name: 'Java' },
  kotlin: { name: 'Kotlin', aliases: ['kt'] },
  c: { name: 'C' },
  cpp: { name: 'C++', aliases: ['c++'] },
  csharp: { name: 'C#', aliases: ['cs', 'c#'] },
  go: { name: 'Go', aliases: ['golang'] },
  rust: { name: 'Rust', aliases: ['rs'] },
  html: { name: 'HTML' },
  css: { name: 'CSS' },
  json: { name: 'JSON' },
  sql: { name: 'SQL' },
  bash: { name: 'Shell', aliases: ['sh', 'shell', 'zsh'] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  yaml: { name: 'YAML', aliases: ['yml'] },
}

const noteEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      defaultLanguage: 'text',
      supportedLanguages: codeLanguages,
    }),
  },
})

export function NotionBlockEditor({
  ariaLabel = '노트 내용',
  className,
  initialDocument,
  initialValue,
  onChange,
}: NotionBlockEditorProps) {
  const { mode } = useTheme()
  const initialDocumentRef = useRef(initialDocument)
  const initialValueRef = useRef(initialValue)
  const isInitializingRef = useRef(true)
  const [floatingUiRoot] = useState(() => {
    const root = document.createElement('div')
    root.className = 'bn-container bn-mantine notion-block-editor-floating-ui'
    return root
  })
  const editor = useCreateBlockNote({ dictionary: ko, schema: noteEditorSchema, domAttributes: { editor: { 'aria-label': ariaLabel || '노트 본문' } } })

  useEffect(() => {
    const savedBlocks = parseSavedBlocks(initialDocumentRef.current)
    const markdownBlocks = editor.tryParseMarkdownToBlocks(
      normalizeLegacyToggleMarkdown(initialValueRef.current),
    )
    const nextBlocks = savedBlocks ?? markdownBlocks

    if (nextBlocks.length > 0) {
      editor.replaceBlocks(editor.document, nextBlocks)
    }
    isInitializingRef.current = false
  }, [editor])

  const isDark =
    mode === 'dark' ||
    (mode === 'system' && document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.body.append(floatingUiRoot)
    return () => {
      floatingUiRoot.remove()
    }
  }, [floatingUiRoot])

  useEffect(() => {
    floatingUiRoot?.setAttribute(
      'data-mantine-color-scheme',
      isDark ? 'dark' : 'light',
    )
  }, [floatingUiRoot, isDark])

  return (
    <div
      aria-label={ariaLabel}
      className={cx('notion-block-editor min-h-0 rounded-lg border border-stone-200 bg-white', className)}
      role="group"
    >
      <BlockNoteView
        emojiPicker={false}
        editor={editor}
        onChange={() => {
          if (isInitializingRef.current) return
          onChange(
            editor.blocksToMarkdownLossy(editor.document).trim(),
            JSON.stringify(editor.document),
          )
        }}
        portalElements={{ tableHandles: floatingUiRoot }}
        slashMenu={false}
        theme={isDark ? 'dark' : 'light'}
      >
        <SearchableEmojiPicker portalElement={floatingUiRoot} />
        <SuggestionMenuController
          getItems={async (query) =>
            filterSuggestionItems(getNotionSlashMenuItems(editor), query)
          }
          triggerCharacter="/"
        />
      </BlockNoteView>
    </div>
  )
}

interface EmojiPickerPosition {
  left: number
  maxHeight: number
  top: number
}

function SearchableEmojiPicker({ portalElement }: { portalElement: HTMLElement }) {
  const editor = useBlockNoteEditor()
  const suggestionMenu = useExtension(SuggestionMenuExtension)
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDetachedRef = useRef(false)
  const [position, setPosition] = useState<EmojiPickerPosition | null>(null)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<DefaultReactGridSuggestionItem[]>([])

  useEffect(() => {
    suggestionMenu.addSuggestionMenu({ triggerCharacter: ':' })
    const unsubscribe = suggestionMenu.store.subscribe(({ currentVal }) => {
      if (currentVal?.show && currentVal.triggerCharacter === ':') {
        const pickerWidth = Math.min(496, window.innerWidth - 32)
        const top = currentVal.referencePos.bottom + 8
        isDetachedRef.current = false
        setPosition({
          left: Math.max(
            16,
            Math.min(currentVal.referencePos.left, window.innerWidth - pickerWidth - 16),
          ),
          maxHeight: Math.max(160, window.innerHeight - top - 16),
          top,
        })
        setQuery(currentVal.query)
      } else if (!isDetachedRef.current) {
        setPosition(null)
      }
    })

    return () => {
      unsubscribe()
      suggestionMenu.removeSuggestionMenu(':')
    }
  }, [suggestionMenu])

  useEffect(() => {
    if (!position) return
    let cancelled = false
    void getDefaultReactEmojiPickerItems(editor, query)
      .then((nextItems) => {
        if (!cancelled) setItems(nextItems)
      })

    return () => {
      cancelled = true
    }
  }, [editor, position, query])

  useEffect(() => {
    if (!position) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      ) {
        isDetachedRef.current = false
        setPosition(null)
        suggestionMenu.closeMenu()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [position, suggestionMenu])

  if (!position) return null

  function focusSearch() {
    if (isDetachedRef.current) return
    isDetachedRef.current = true
    suggestionMenu.clearQuery()
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function insertEmoji(item: DefaultReactGridSuggestionItem) {
    item.onItemClick()
    isDetachedRef.current = false
    setPosition(null)
    editor.focus()
  }

  return createPortal(
    <div
      aria-label="아이콘 선택"
      className="notion-emoji-picker notion-emoji-picker-popover"
      ref={pickerRef}
      role="dialog"
      style={{
        left: position.left,
        maxHeight: position.maxHeight,
        top: position.top,
      }}
    >
      <label className="notion-emoji-picker-search">
        <Search aria-hidden="true" size={16} />
        <span className="sr-only">아이콘 검색</span>
        <input
          aria-label="아이콘 검색"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={focusSearch}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              isDetachedRef.current = false
              setPosition(null)
              editor.focus()
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder="아이콘 검색"
          ref={inputRef}
          type="search"
          value={query}
        />
      </label>
      <div
        aria-label="아이콘 목록"
        className="notion-emoji-picker-grid"
        role="grid"
      >
        {items.map((item) => (
          <button
            aria-label={`${item.id} 삽입`}
            className="notion-emoji-picker-item"
            key={item.id}
            onClick={() => insertEmoji(item)}
            type="button"
          >
            {item.icon ?? item.id}
          </button>
        ))}
        {items.length === 0 ? (
          <p className="notion-emoji-picker-empty">검색 결과가 없습니다.</p>
        ) : null}
      </div>
    </div>,
    portalElement,
  )
}

export default NotionBlockEditor

function getNotionSlashMenuItems(
  editor: ReturnType<typeof useCreateBlockNote>,
) {
  return filterNoteSlashMenuItems(getDefaultReactSlashMenuItems(editor))
}

function parseSavedBlocks(documentValue?: string): Block[] | null {
  if (!documentValue) return null
  try {
    const parsed = JSON.parse(documentValue) as unknown
    return Array.isArray(parsed) ? (parsed as Block[]) : null
  } catch {
    return null
  }
}

function normalizeLegacyToggleMarkdown(markdown: string): string {
  return markdown.replace(
    /^:::toggle\s+(.+)\r?\n([\s\S]*?)\r?\n:::/gm,
    (_match, title: string, body: string) => `### ${title}\n${body}`,
  )
}
