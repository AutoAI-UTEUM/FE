import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { MobileWorkspaceTabs } from './MobileWorkspaceTabs'

function Harness() {
  const [active, setActive] = useState<'content' | 'learning'>('content')
  return (
    <MobileWorkspaceTabs
      active={active}
      items={[{ label: '자료', value: 'content' }, { label: '학습', value: 'learning' }]}
      onChange={setActive}
    />
  )
}

describe('MobileWorkspaceTabs', () => {
  it('keeps both workspace choices and updates the selected tab', () => {
    render(<Harness />)

    expect(screen.getByRole('tab', { name: '자료' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: '학습' }))
    expect(screen.getByRole('tab', { name: '학습' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '자료' })).toHaveAttribute('aria-selected', 'false')
  })
})
