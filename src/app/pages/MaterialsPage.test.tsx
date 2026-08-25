import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_MATERIAL_UPLOAD_BYTES } from '../../features/materials'
import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { MaterialViewerRedirectPage } from './MaterialViewerRedirectPage'
import { MaterialsPage } from './MaterialsPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function renderMaterialsPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter>
        <MaterialsPage />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

function renderMaterialViewer(path: string) {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/materials/:materialId" element={<MaterialViewerRedirectPage />} />
          <Route path="/sessions/:sessionId" element={<p>PDF 뷰어</p>} />
        </Routes>
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('MaterialsPage', () => {
  it('renders statuses returned by the materials API', async () => {
    renderMaterialsPage()

    expect(await screen.findByText('시험 대비 요약.pdf')).toBeInTheDocument()
    expect(screen.getByText('준비 완료')).toBeInTheDocument()
    expect(screen.getByText('처리 중')).toBeInTheDocument()
    expect(screen.getByText('처리 실패')).toBeInTheDocument()
    expect(
      screen.getByText(
        '파일 업로드는 완료됐지만 PDF 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('진행 중인 학습 세션이 있습니다.')).toBeInTheDocument()
  })

  it('polls the list while a material is processing and stops when ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let listCalls = 0
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/materials') {
        listCalls += 1
        return apiSuccess({
          items: [
            {
              createdAt: '2026-07-23T00:00:00Z',
              materialId: 11,
              pageCount: listCalls > 1 ? 12 : undefined,
              processingStatus: listCalls > 1 ? 'READY' : 'PROCESSING',
              title: '강의 노트 5주차.pdf',
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        })
      }
      return undefined
    })
    renderMaterialsPage()

    expect(await screen.findByText('처리 중')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(5000)
    expect(await screen.findByText('준비 완료')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(listCalls).toBe(2)
    vi.useRealTimers()
  })

  it('deletes a material after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderMaterialsPage()

    fireEvent.click(
      await screen.findByRole('button', { name: '강의 노트 5주차.pdf 삭제' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByText('강의 노트 5주차.pdf'),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByText('자료를 삭제했습니다.')).toBeInTheDocument()
  })

  it('explains the active-session conflict when deletion returns 409', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderMaterialsPage()

    fireEvent.click(
      await screen.findByRole('button', { name: '시험 대비 요약.pdf 삭제' }),
    )

    expect(
      await screen.findByText(/진행 중인 학습 세션이 있어 삭제할 수 없습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('시험 대비 요약.pdf')).toBeInTheDocument()
  })

  it('renames an existing material', async () => {
    let renameBody: unknown
    let renameContentType: string | null = null
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'PATCH' && url.pathname === '/api/materials/11') {
        renameContentType = request.headers.get('Content-Type')
        return request.json().then((body) => {
          renameBody = body
          return apiSuccess({
            createdAt: '2026-07-23T00:00:00Z',
            materialId: 11,
            processingStatus: 'PROCESSING',
            title: '직접 정한 자료명',
          })
        })
      }
      return undefined
    })
    renderMaterialsPage()

    fireEvent.click(await screen.findByRole('button', { name: '강의 노트 5주차.pdf 이름 변경' }))
    const dialog = screen.getByRole('dialog', { name: '자료 이름 변경' })
    const titleInput = within(dialog).getByRole('textbox', { name: '자료 제목' })
    expect(titleInput).toHaveValue('강의 노트 5주차.pdf')
    fireEvent.change(titleInput, { target: { value: '직접 정한 자료명' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '변경사항 저장' }))

    expect(await screen.findByRole('heading', { name: '직접 정한 자료명' })).toBeInTheDocument()
    expect(renameBody).toEqual({ title: '직접 정한 자료명' })
    expect(renameContentType).toBe('application/json')
    expect(screen.getByText('자료 이름을 변경했습니다.')).toBeInTheDocument()
  })

  it('rejects non-PDF uploads before making an API request', () => {
    renderMaterialsPage()

    fireEvent.change(screen.getByLabelText('PDF 파일'), {
      target: {
        files: [new File(['plain text'], 'notes.txt', { type: 'text/plain' })],
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'PDF 파일만 업로드할 수 있습니다.',
    )
  })

  it('rejects uploads over 45MB before submission', () => {
    renderMaterialsPage()
    const file = new File(['pdf'], 'large.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', {
      value: MAX_MATERIAL_UPLOAD_BYTES + 1,
    })

    fireEvent.change(screen.getByLabelText('PDF 파일'), {
      target: { files: [file] },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      '45MB 이하의 PDF 파일만 업로드할 수 있습니다.',
    )
  })

  it(
    'uses the full file name as the editable default title',
    async () => {
      installApiFixtureServer((request) => {
        const url = new URL(request.url)
        if (request.method === 'POST' && url.pathname === '/api/materials') {
          return apiSuccess({
            createdAt: '2026-08-25T00:00:00Z',
            materialId: 13,
            processingStatus: 'PROCESSING',
            title: 'uploaded.pdf',
          })
        }
        return undefined
      })
      renderMaterialsPage()
      await screen.findByText('시험 대비 요약.pdf')

      fireEvent.change(screen.getByLabelText('PDF 파일'), {
        target: {
          files: [
            new File(['pdf'], 'uploaded.pdf', { type: 'application/pdf' }),
          ],
        },
      })

      expect(screen.getByRole('textbox', { name: '자료 제목' })).toHaveValue('uploaded.pdf')
      expect(screen.getByRole('button', { name: '업로드' })).toBeEnabled()

      fireEvent.click(screen.getByRole('button', { name: '업로드' }))

      expect(
        await screen.findByRole(
          'heading',
          { name: 'uploaded.pdf' },
          { timeout: 10_000 },
        ),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /업로드 취소/ }),
      ).not.toBeInTheDocument()
    },
    15_000,
  )

  it('keeps the file extension in the default title and rejects an empty title', async () => {
    renderMaterialsPage()
    await screen.findByText('시험 대비 요약.pdf')

    fireEvent.change(screen.getByLabelText('PDF 파일'), {
      target: {
        files: [new File(['pdf'], 'LECTURE.PDF', { type: 'application/pdf' })],
      },
    })

    const titleInput = screen.getByRole('textbox', { name: '자료 제목' })
    const uploadButton = screen.getByRole('button', { name: '업로드' })
    expect(titleInput).toHaveValue('LECTURE.PDF')
    expect(uploadButton).toBeEnabled()

    fireEvent.change(titleInput, { target: { value: '직접 입력한 제목' } })
    expect(uploadButton).toBeEnabled()
    fireEvent.change(titleInput, { target: { value: '   ' } })
    expect(uploadButton).toBeDisabled()
  })

  it('ignores duplicate submissions while an upload is pending', async () => {
    let uploadCalls = 0
    let resolveUpload!: (response: Response) => void
    const pendingUpload = new Promise<Response>((resolve) => {
      resolveUpload = resolve
    })
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/api/materials') {
        uploadCalls += 1
        return pendingUpload
      }
      return undefined
    })
    renderMaterialsPage()
    await screen.findByText('시험 대비 요약.pdf')

    fireEvent.change(screen.getByLabelText('PDF 파일'), {
      target: {
        files: [new File(['pdf'], 'lecture.pdf', { type: 'application/pdf' })],
      },
    })

    fireEvent.change(screen.getByRole('textbox', { name: '자료 제목' }), {
      target: { value: 'lecture' },
    })

    const form = screen.getByRole('textbox', { name: '자료 제목' }).closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)
    fireEvent.submit(form!)

    await waitFor(() => expect(uploadCalls).toBe(1))
    resolveUpload(apiSuccess({
      createdAt: '2026-08-12T00:00:00Z',
      materialId: 99,
      processingStatus: 'PROCESSING',
      title: 'lecture',
    }))
    expect(await screen.findByRole('heading', { name: 'lecture' })).toBeInTheDocument()
  })
})

describe('MaterialViewerRedirectPage', () => {
  it('creates or restores a session and opens the PDF viewer immediately', async () => {
    renderMaterialViewer('/materials/14')

    expect(await screen.findByText('PDF 뷰어')).toBeInTheDocument()
  })
})
