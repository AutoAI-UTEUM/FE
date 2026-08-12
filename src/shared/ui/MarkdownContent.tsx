import rehypeKatex from 'rehype-katex'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

import { cx } from '../lib/cx'

interface MarkdownContentProps {
  className?: string
  content: string
  isStreaming?: boolean
}

const markdownCodePattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g

function isLikelyUndelimitedLatex(expression: string): boolean {
  if (expression.includes('\n') || /[가-힣]/.test(expression)) return false

  const hasLatexSyntax = /\\[A-Za-z]+/.test(expression)
    || /[_^](?:\{|[A-Za-z0-9])/.test(expression)
  const hasMathOperator = /[=+\-*/<>]/.test(expression)
  return hasLatexSyntax && hasMathOperator
}

function normalizeParenthesizedLatex(content: string): string {
  let normalized = ''
  let index = 0
  let isInsideMath = false

  while (index < content.length) {
    const character = content[index]

    if (character === '$' && content[index - 1] !== '\\') {
      const delimiter = content[index + 1] === '$' ? '$$' : '$'
      normalized += delimiter
      index += delimiter.length
      isInsideMath = !isInsideMath
      continue
    }

    if (!isInsideMath && character === '(' && content[index - 1] !== '\\') {
      let cursor = index + 1
      let depth = 1

      while (cursor < content.length && depth > 0) {
        if (content[cursor] === '(') depth += 1
        if (content[cursor] === ')') depth -= 1
        cursor += 1
      }

      if (depth === 0) {
        const expression = content.slice(index + 1, cursor - 1).trim()
        if (isLikelyUndelimitedLatex(expression)) {
          normalized += `$${expression}$`
          index = cursor
          continue
        }
      }
    }

    normalized += character
    index += 1
  }

  return normalized
}

function normalizeWrappedStrongPunctuation(content: string): string {
  return content.replace(
    /\*\*(["'“‘「『(])([^*\n]+?)(["'”’」』)])\*\*/g,
    (_, opening: string, value: string, closing: string) => (
      `${opening}**${value}**${closing}`
    ),
  )
}

function hideIncompleteStreamingStrongDelimiter(content: string): string {
  const delimiters: number[] = []
  for (let index = 0; index < content.length - 1; index += 1) {
    if (content[index] === '*' && content[index + 1] === '*' && content[index - 1] !== '\\') {
      delimiters.push(index)
      index += 1
    }
  }
  if (delimiters.length % 2 === 0) return content
  const lastDelimiter = delimiters.at(-1)
  return lastDelimiter === undefined
    ? content
    : `${content.slice(0, lastDelimiter)}${content.slice(lastDelimiter + 2)}`
}

function normalizeMarkdownLatex(content: string, isStreaming: boolean): string {
  return content
    .split(markdownCodePattern)
    .map((segment, index) => {
      if (index % 2 === 1) return segment

      const withStandardDelimiters = segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression: string) => (
          `\n$$\n${expression.trim()}\n$$\n`
        ))
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression: string) => (
          `$${expression.trim()}$`
        ))

      const withStableStrongEmphasis = normalizeWrappedStrongPunctuation(withStandardDelimiters)
      return normalizeParenthesizedLatex(
        isStreaming
          ? hideIncompleteStreamingStrongDelimiter(withStableStrongEmphasis)
          : withStableStrongEmphasis,
      )
    })
    .join('')
}

export function MarkdownContent({ className, content, isStreaming = false }: MarkdownContentProps) {
  return (
    <div
      className={cx(
        'min-w-0 overflow-x-auto break-words type-body leading-6 text-inherit',
        '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
        '[&_a]:text-brand-600 [&_a]:underline dark:[&_a]:text-brand-400',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 dark:[&_blockquote]:text-stone-800',
        '[&_code]:rounded [&_code]:bg-white [&_code]:px-1 [&_code]:py-0.5 [&_code]:type-control dark:[&_code]:bg-stone-100 dark:[&_code]:text-stone-900',
        '[&_h1]:mt-2 [&_h1]:type-section-title [&_h1]:font-bold',
        '[&_h2]:mt-2 [&_h2]:type-body [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold',
        '[&_hr]:my-3 [&_hr]:border-stone-200 [&_li]:my-0.5',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-white [&_pre]:p-2 dark:[&_pre]:bg-stone-100 dark:[&_pre]:text-stone-900',
        '[&_strong]:font-bold',
        '[&_table]:my-3 [&_table]:min-w-full [&_table]:border-collapse [&_table]:bg-white [&_table]:type-caption dark:[&_table]:bg-stone-50 dark:[&_table]:text-stone-900',
        '[&_td]:border [&_td]:border-stone-200 [&_td]:px-2.5 [&_td]:py-2 dark:[&_td]:bg-stone-50 dark:[&_td]:text-stone-900',
        '[&_th]:whitespace-nowrap [&_th]:border [&_th]:border-stone-200 [&_th]:bg-stone-50 [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold dark:[&_th]:bg-stone-100 dark:[&_th]:text-stone-950',
        '[&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
    >
      <Markdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizeMarkdownLatex(content, isStreaming)}
      </Markdown>
    </div>
  )
}
