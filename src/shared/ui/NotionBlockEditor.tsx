import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  type Block,
} from '@blocknote/core'
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
import { useEffect, useRef, useState } from 'react'

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
  const editor = useCreateBlockNote({ dictionary: ko, schema: noteEditorSchema })

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
  return getDefaultReactSlashMenuItems(editor)
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
