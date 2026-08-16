import type { Block } from '@blocknote/core'
import { ko } from '@blocknote/core/locales'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import '@blocknote/core/fonts/inter.css'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import { useEffect, useRef } from 'react'

import { cx } from '../lib/cx'
import { useTheme } from '../theme'
import './NotionBlockEditor.css'

interface NotionBlockEditorProps {
  ariaLabel?: string
  className?: string
  initialDocument?: string
  initialValue: string
  onChange: (markdown: string, document: string) => void
}

const allowedSlashMenuTitles = [
  ko.slash_menu.paragraph.title,
  ko.slash_menu.heading.title,
  ko.slash_menu.heading_2.title,
  ko.slash_menu.heading_3.title,
  ko.slash_menu.toggle_heading.title,
  ko.slash_menu.toggle_list.title,
  ko.slash_menu.bullet_list.title,
  ko.slash_menu.numbered_list.title,
  ko.slash_menu.check_list.title,
  ko.slash_menu.quote.title,
  ko.slash_menu.divider.title,
  ko.slash_menu.table.title,
  ko.slash_menu.code_block.title,
]

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
  const editor = useCreateBlockNote({ dictionary: ko })

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

  return (
    <div
      aria-label={ariaLabel}
      className={cx('notion-block-editor min-h-0 rounded-lg border border-stone-200 bg-white', className)}
      role="group"
    >
      <BlockNoteView
        editor={editor}
        onChange={() => {
          if (isInitializingRef.current) return
          onChange(
            editor.blocksToMarkdownLossy(editor.document).trim(),
            JSON.stringify(editor.document),
          )
        }}
        slashMenu={false}
        theme={isDark ? 'dark' : 'light'}
      >
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

export default NotionBlockEditor

function getNotionSlashMenuItems(
  editor: ReturnType<typeof useCreateBlockNote>,
) {
  const defaultItems = getDefaultReactSlashMenuItems(editor)
  const itemByTitle = new Map(defaultItems.map((item) => [item.title, item]))

  return allowedSlashMenuTitles.flatMap((title) => {
    const item = itemByTitle.get(title)
    return item ? [item] : []
  })
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
