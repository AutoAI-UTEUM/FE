import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createExamsRepository, type Exam } from '../../../features/exams'
import type { AuthenticatedRequest } from '../../../features/auth'
import { instructorExamListItem } from '../../../test/examListFixtures'
import { ToastProvider } from '../../../shared/ui'
import { ExamContentPanel, NoticeContentPanel, NoticeDetailPanel } from './ClassroomContentPanels'

afterEach(cleanup)

describe('NoticeContentPanel', () => {
  it('sends the selected week and immediate publishing fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<NoticeContentPanel disabled={false} notice={null} onClose={vi.fn()} onSave={onSave} weekNumber={3} />)

    fireEvent.change(screen.getByLabelText('공지 제목'), { target: { value: '3주차 안내' } })
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '수업 자료를 확인하세요.' } })
    fireEvent.click(screen.getByRole('button', { name: '공지 게시' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      content: '수업 자료를 확인하세요.',
      publishAt: null,
      title: '3주차 안내',
      weekNumber: 3,
    }, undefined))
  })

  it('converts a future local reservation time to an ISO timestamp', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<NoticeContentPanel disabled={false} notice={null} onClose={vi.fn()} onSave={onSave} weekNumber={null} />)

    fireEvent.change(screen.getByLabelText('공지 제목'), { target: { value: '전체 안내' } })
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '예약 공지입니다.' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 게시' }))
    fireEvent.change(screen.getByLabelText('예약 공개 시각'), { target: { value: '2099-08-12T09:30' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 등록' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      content: '예약 공지입니다.',
      publishAt: new Date('2099-08-12T09:30').toISOString(),
      title: '전체 안내',
      weekNumber: null,
    }, undefined))
  })
})

describe('NoticeDetailPanel', () => {
  it('renders markdown and enters edit mode only from the edit button', () => {
    const onEdit = vi.fn()
    render(
      <NoticeDetailPanel
        canEdit
        notice={noticeFixture}
        onClose={vi.fn()}
        onEdit={onEdit}
      />,
    )

    expect(screen.getByRole('heading', { name: '수업 준비 안내' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '준비물' })).toBeInTheDocument()
    expect(screen.getByText('노트북')).toBeInTheDocument()
    expect(screen.queryByLabelText('공지 제목')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '편집하기' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('hides the edit action when the notice is read-only', () => {
    render(
      <NoticeDetailPanel
        canEdit={false}
        notice={noticeFixture}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '편집하기' })).not.toBeInTheDocument()
  })
})

describe('ExamContentPanel', () => {
  it('loads full exam detail before editing a list summary and preserves questions on save', async () => {
    const exam = await loadSummary()
    const pending = deferred<Exam>()
    const repository = { get: vi.fn().mockReturnValue(pending.promise), update: vi.fn().mockResolvedValue(detailFixture) }
    const onSaved = vi.fn()
    renderPanel(exam, repository, { onSaved })

    expect(screen.getByText('시험을 불러오는 중입니다.')).toHaveAttribute('role', 'status')
    expect(screen.queryByLabelText('시험 제목')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
    expect(repository.get).toHaveBeenCalledExactlyOnceWith('31', expect.any(AbortSignal))
    await act(async () => pending.resolve(detailFixture))

    expect(screen.getByLabelText('질문')).toHaveValue('전체 상세 문항')
    fireEvent.change(screen.getByLabelText('시험 제목'), { target: { value: '수정한 제목' } })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(detailFixture))
    expect(repository.update).toHaveBeenCalledWith('31', expect.objectContaining({ title: '수정한 제목', questions: detailFixture.questions }))
  })

  it('does not reset a dirty draft when the same list summary refreshes', async () => {
    const exam = await loadSummary()
    const repository = { get: vi.fn().mockResolvedValue(detailFixture) }
    const view = renderPanel(exam, repository)
    await screen.findByDisplayValue('전체 상세 문항')
    fireEvent.change(screen.getByLabelText('시험 제목'), { target: { value: '저장 전 수정' } })

    view.rerender(panelElement({ ...exam, title: '갱신된 목록 제목' }, repository))

    expect(screen.getByLabelText('시험 제목')).toHaveValue('저장 전 수정')
    expect(repository.get).toHaveBeenCalledOnce()
  })

  it('blocks editing on a detail failure and retries explicitly', async () => {
    const exam = await loadSummary()
    const repository = { get: vi.fn().mockRejectedValueOnce(new Error('상세 조회 실패')).mockResolvedValueOnce(detailFixture) }
    renderPanel(exam, repository)

    expect(await screen.findByText('시험을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByLabelText('시험 제목')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '시험 공개' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByDisplayValue('전체 상세 문항')).toBeInTheDocument()
    expect(repository.get).toHaveBeenCalledTimes(2)
  })

  it('ignores a late detail response when switching exams', async () => {
    const exam = await loadSummary()
    const pending = deferred<Exam>()
    const repository = { get: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...detailFixture, id: '32', title: '다른 시험' }) }
    const view = renderPanel(exam, repository)
    const firstSignal = repository.get.mock.calls[0]?.[1] as AbortSignal

    view.rerender(panelElement({ ...exam, id: '32' }, repository))
    expect(await screen.findByDisplayValue('다른 시험')).toBeInTheDocument()
    expect(firstSignal.aborted).toBe(true)
    await act(async () => pending.resolve(detailFixture))
    expect(screen.getByLabelText('시험 제목')).toHaveValue('다른 시험')
  })

  it('cancels the detail request when the panel closes', async () => {
    const exam = await loadSummary()
    const pending = deferred<Exam>()
    const repository = { get: vi.fn().mockReturnValue(pending.promise) }
    const onClose = vi.fn()
    const view = renderPanel(exam, repository, { onClose })
    const signal = repository.get.mock.calls[0]?.[1] as AbortSignal

    fireEvent.click(screen.getByRole('button', { name: '목록으로 돌아가기' }))
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(detailFixture))
    expect(screen.queryByLabelText('시험 제목')).not.toBeInTheDocument()
  })

  it('loads the current status from detail and leaves read-only actions disabled', async () => {
    const exam = await loadSummary()
    const repository = { get: vi.fn().mockResolvedValue(detailFixture) }
    renderPanel(exam, repository, { disabled: true })

    await screen.findByDisplayValue('전체 상세 문항')
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '시험 공개' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
  })

  it('does not allow editing if detail says a listed draft has already been published', async () => {
    const exam = await loadSummary()
    const repository = { get: vi.fn().mockResolvedValue({ ...detailFixture, status: 'PUBLISHED' }) }
    renderPanel(exam, repository)

    expect(await screen.findByText('공개되거나 종료된 시험은 상세 화면에서 응시 및 제출 현황을 확인합니다.')).toBeInTheDocument()
    expect(screen.queryByLabelText('시험 제목')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
  })

  it('shows the published state on the same panel after a successful publish', async () => {
    const exam = await loadSummary()
    const published = { ...detailFixture, status: 'PUBLISHED' as const }
    const repository = { get: vi.fn().mockResolvedValue(detailFixture), publish: vi.fn().mockResolvedValue(published) }
    const onSaved = vi.fn()
    renderPanel(exam, repository, { onSaved })
    await screen.findByDisplayValue('전체 상세 문항')

    fireEvent.click(screen.getByRole('button', { name: '시험 공개' }))

    expect(await screen.findByText('공개되거나 종료된 시험은 상세 화면에서 응시 및 제출 현황을 확인합니다.')).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalledWith(published)
    expect(screen.queryByLabelText('시험 제목')).not.toBeInTheDocument()
  })

  it('continues from create to full-detail editing without losing the saved fields', async () => {
    const saved = { ...detailFixture, title: '새 시험', weekNumber: 3 }
    const repository = { create: vi.fn().mockResolvedValue(saved), get: vi.fn().mockResolvedValue(saved) }
    function CreateThenEdit() {
      const [exam, setExam] = useState<Exam | null>(null)
      return panelElement(exam, repository, { onSaved: setExam })
    }
    render(<CreateThenEdit />)
    fireEvent.change(screen.getByLabelText('시험 제목'), { target: { value: saved.title } })
    fireEvent.change(screen.getByLabelText('질문'), { target: { value: saved.questions[0].questionText } })
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))

    expect(await screen.findByRole('button', { name: '변경사항 저장' })).toBeEnabled()
    expect(screen.getByLabelText('시험 제목')).toHaveValue(saved.title)
    expect(screen.getByLabelText('질문')).toHaveValue(saved.questions[0].questionText)
    expect(screen.getByLabelText('주차 (선택)')).toHaveValue(3)
    expect(repository.create).toHaveBeenCalledOnce()
    expect(repository.get).toHaveBeenCalledOnce()
  })

  it('blocks editing if the detail belongs to a different classroom', async () => {
    const exam = await loadSummary()
    renderPanel(exam, { get: vi.fn().mockResolvedValue({ ...detailFixture, classroomId: '99' }) })

    expect(await screen.findByText('시험의 강의실 정보를 확인해 주세요.')).toBeInTheDocument()
    expect(screen.queryByLabelText('시험 제목')).not.toBeInTheDocument()
  })

  it('does not fetch detail for a new exam composer', () => {
    const repository = { get: vi.fn() }
    renderPanel(null, repository)

    expect(screen.getByLabelText('시험 제목')).toHaveValue('')
    expect(repository.get).not.toHaveBeenCalled()
  })

  it('한다면 안에서 시험 편집 영역만 스크롤한다', () => {
    render(
      <ToastProvider>
        <ExamContentPanel
          classroomId="12"
          disabled={false}
          exam={null}
          initialWeekNumber={3}
          onClose={vi.fn()}
          onDeleted={vi.fn()}
          onSaved={vi.fn()}
          repository={{} as never}
        />
      </ToastProvider>,
    )

    const editorRegion = screen.getByRole('region', { name: '시험 편집 영역' })
    expect(editorRegion).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain', '[scrollbar-gutter:stable]')
    expect(editorRegion.closest('form')).toHaveClass('flex', 'h-full', 'min-h-0', 'flex-col', 'overflow-hidden')
  })
})

const noticeFixture = {
  classroomId: '12',
  content: '## 준비물\n\n- 노트북\n- 필기구',
  createdAt: '2026-08-01T00:00:00Z',
  id: '20',
  publishAt: null,
  published: true,
  publishedAt: '2026-08-02T00:00:00Z',
  title: '수업 준비 안내',
  updatedAt: '2026-08-02T00:00:00Z',
  weekNumber: null,
}

const detailFixture: Exam = {
  allowRetake: false,
  classroomId: '12',
  id: '31',
  questionCount: 1,
  questions: [{ id: 'q1', maxScore: 20, points: 20, questionText: '전체 상세 문항', questionType: 'SHORT', referenceAnswer: '정답' }],
  status: 'DRAFT',
  title: '상세 제목',
  totalScore: 20,
}

async function loadSummary() {
  const request = vi.fn().mockResolvedValue({ data: { items: [instructorExamListItem] }, message: '성공', success: true })
  return (await createExamsRepository(request as AuthenticatedRequest).list('12'))[0]
}

type PanelExam = Awaited<ReturnType<typeof loadSummary>> | null
function panelElement(exam: PanelExam, repository: object, options: { disabled?: boolean; onClose?: () => void; onSaved?: (exam: Exam) => void } = {}) {
  return <ToastProvider><ExamContentPanel classroomId="12" disabled={options.disabled ?? false} exam={exam} onClose={options.onClose ?? vi.fn()} onDeleted={vi.fn()} onSaved={options.onSaved ?? vi.fn()} repository={repository as ReturnType<typeof createExamsRepository>} /></ToastProvider>
}

function renderPanel(exam: PanelExam, repository: object, options: { disabled?: boolean; onClose?: () => void; onSaved?: (exam: Exam) => void } = {}) {
  return render(panelElement(exam, repository, options))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
