import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RenameMaterialDialog } from './RenameMaterialDialog'

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => ([{}] as unknown as DOMRectList),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RenameMaterialDialog keyboard accessibility', () => {
  it('focuses the title, traps focus, closes on Escape, and restores the trigger', async () => {
    render(<RenameHarness onSave={vi.fn(async () => true)} />)
    const trigger = screen.getByRole('button', { name: '자료 이름 변경 열기' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '자료 이름 변경' })
    const titleInput = within(dialog).getByRole('textbox', { name: '자료 제목' })
    expect(titleInput).toHaveFocus()

    fireEvent.change(titleInput, { target: { value: '새 자료 이름' } })
    const closeButton = within(dialog).getByRole('button', { name: '자료 이름 변경 닫기' })
    closeButton.focus()
    expect(closeButton).toHaveFocus()
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(titleInput).toHaveFocus()
    fireEvent.keyDown(titleInput, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(titleInput, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('does not close while a save is in progress', async () => {
    const save = deferred<boolean>()
    render(<RenameHarness onSave={() => save.promise} />)
    fireEvent.click(screen.getByRole('button', { name: '자료 이름 변경 열기' }))
    const dialog = screen.getByRole('dialog', { name: '자료 이름 변경' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '자료 제목' }), {
      target: { value: '저장 중인 자료' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '변경사항 저장' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.mouseDown(dialog)

    expect(await within(dialog).findByRole('button', { name: '저장 중' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '자료 이름 변경 닫기' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
    expect(screen.getByRole('dialog', { name: '자료 이름 변경' })).toBeInTheDocument()

    await act(async () => save.resolve(false))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '취소' })).toBeEnabled())
  })
})

function RenameHarness({ onSave }: { onSave: (title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">자료 이름 변경 열기</button>
      {open ? (
        <RenameMaterialDialog
          initialTitle="기존 자료 이름"
          onClose={() => setOpen(false)}
          onSave={onSave}
        />
      ) : null}
    </>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
