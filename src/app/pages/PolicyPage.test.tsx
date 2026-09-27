import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installApiFixtureServer } from '../../test/apiFixtureServer'
import { PrivacyPage, TermsPage } from './PolicyPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('PolicyPage', () => {
  it('renders the current terms without authentication', async () => {
    render(<MemoryRouter><TermsPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: '이용약관' })).toBeInTheDocument()
    expect(screen.getByText(/본 약관은 으뜸 서비스 이용 조건을 정합니다/)).toBeInTheDocument()
    expect(screen.getByText(/버전 0.9/)).toBeInTheDocument()
  })

  it('renders the current privacy policy without authentication', async () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: '개인정보 처리방침' })).toBeInTheDocument()
    expect(screen.getByText(/서비스 제공에 필요한 개인정보를 처리합니다/)).toBeInTheDocument()
  })
})
