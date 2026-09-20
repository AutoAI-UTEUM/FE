import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabletMasterDetail } from './TabletMasterDetail'
import { TabletWorkspaceControls, type TabletPane } from './TabletWorkspaceControls'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('tablet interactions', () => {
  it('changes focus and split views without resetting mounted inputs', () => {
    function Workspace() {
      const [pane, setPane] = useState<TabletPane>('both')
      return <><TabletWorkspaceControls canSplit value={pane} onChange={setPane} /><div hidden={pane === 'learning'}><input aria-label="Page" defaultValue="3" /></div><div hidden={pane === 'content'}><textarea aria-label="Draft" /></div></>
    }
    const { rerender } = render(<Workspace />)
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Keep my question' } })
    fireEvent.click(screen.getByRole('button', { name: '자료' }))
    expect(screen.getByRole('button', { name: '자료' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '함께 보기' }))
    rerender(<Workspace />)
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep my question')
    expect(screen.getByLabelText('Page')).toHaveValue('3')
  })

  it('preserves a filtered list and restores focus after a narrow detail closes', () => {
    let resize: () => void = () => {}
    let width = 700
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width } as DOMRect))
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => ([{}] as unknown as DOMRectList))
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
    function List() {
      const [selected, setSelected] = useState(false)
      return <TabletMasterDetail title="Details" listLabel="Members" onClose={() => setSelected(false)} detail={selected ? <input aria-label="Detail input" /> : null}>
        <input aria-label="Search" /><button onClick={() => setSelected(true)}>Member</button>
      </TabletMasterDetail>
    }
    render(<List />)
    const opener = screen.getByRole('button', { name: 'Member' })
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Alice' } })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('button', { name: '목록으로 돌아가기' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Members', hidden: true }).className).toContain('hidden')
    act(() => { width = 1000; resize() })
    expect(screen.getByRole('region', { name: 'Members' }).className).not.toContain('hidden')
    fireEvent.keyDown(screen.getByRole('button', { name: '목록으로 돌아가기' }), { key: 'Escape' })
    expect(opener).toHaveFocus()
    expect(screen.getByLabelText('Search')).toHaveValue('Alice')
  })
})
