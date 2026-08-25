import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../theme'
import { NotionBlockEditor } from './NotionBlockEditor'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      media: query,
      removeEventListener: vi.fn(),
    })),
  })
})

describe('NotionBlockEditor', () => {
  it('offers programming language selection for code blocks', async () => {
    const initialDocument = JSON.stringify([
      {
        children: [],
        content: 'const answer = 42',
        id: 'code-block',
        props: { language: 'javascript' },
        type: 'codeBlock',
      },
    ])

    render(
      <ThemeProvider>
        <NotionBlockEditor
          initialDocument={initialDocument}
          initialValue={'```javascript\nconst answer = 42\n```'}
          onChange={() => undefined}
        />
      </ThemeProvider>,
    )

    const languageSelect = await screen.findByRole('combobox')
    expect(languageSelect).toHaveValue('javascript')
    expect(screen.getByRole('option', { name: '일반 텍스트' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'TypeScript' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Python' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'SQL' })).toBeInTheDocument()
  })

  it('mounts table controls in an unclipped floating layer', async () => {
    const { unmount } = render(
      <ThemeProvider>
        <NotionBlockEditor
          initialDocument={JSON.stringify([
            {
              children: [],
              content: {
                columnWidths: [undefined, undefined],
                headerCols: 0,
                headerRows: 0,
                rows: [{ cells: ['', ''] }, { cells: ['', ''] }],
                type: 'tableContent',
              },
              id: 'table-block',
              props: {},
              type: 'table',
            },
          ])}
          initialValue={'| A | B |\n| - | - |\n| 1 | 2 |'}
          onChange={() => undefined}
        />
      </ThemeProvider>,
    )

    expect(document.body.querySelector('.notion-block-editor-floating-ui')).toBeInTheDocument()
    unmount()
    expect(document.body.querySelector('.notion-block-editor-floating-ui')).not.toBeInTheDocument()
  })
})
