import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { StudyScratchpad } from './StudyScratchpad'
import { workspaceKey, writeWorkspaceValue } from './workspaceStorage'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('study scratchpad', () => {
  it('restores text per account and page without sharing a different scope', () => {
    const view = render(<StudyScratchpad owner="id:1" scope="session:100:page:1" />)
    fireEvent.click(screen.getByText('펜 · 메모'))
    fireEvent.change(screen.getByLabelText('글자 메모'), { target: { value: '나의 풀이' } })
    view.rerender(<StudyScratchpad owner="id:1" scope="session:100:page:2" />)
    expect(screen.getByLabelText('글자 메모')).toHaveValue('')
    view.rerender(<StudyScratchpad owner="id:2" scope="session:100:page:1" />)
    expect(screen.getByLabelText('글자 메모')).toHaveValue('')
    view.rerender(<StudyScratchpad owner="id:1" scope="session:100:page:1" />)
    expect(screen.getByLabelText('글자 메모')).toHaveValue('나의 풀이')
  })

  it('bounds malformed saved drawings and shows failed writes', () => {
    writeWorkspaceValue(workspaceKey('id:1', 'quiz:50:question:q1'), { text: 'unsafe data', strokes: [[[Infinity, 4]]] })
    render(<StudyScratchpad owner="id:1" scope="quiz:50:question:q1" />)
    fireEvent.click(screen.getByText('펜 · 메모'))
    expect(screen.getByLabelText('글자 메모')).toHaveValue('')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    fireEvent.change(screen.getByLabelText('글자 메모'), { target: { value: '화면에 남겨 주세요' } })
    expect(screen.getByLabelText('글자 메모')).toHaveValue('화면에 남겨 주세요')
    expect(screen.getByRole('status')).toHaveTextContent('브라우저 저장 실패')
  })
})
