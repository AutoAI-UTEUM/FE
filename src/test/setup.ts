import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { vi } from 'vitest'

// 모든 라우트가 lazy()라 findBy 계열과 waitFor는 동적 import가 끝날 때까지 기다린다.
// 전체 스위트를 병렬로 돌리면 이게 기본값 1초를 넘겨 간헐적으로 실패했다.
// 단정을 약화시키지 않고 대기 한도만 늘린다.
configure({ asyncUtilTimeout: 5000 })

// jsdom에는 scrollIntoView가 없다 (채팅 자동 스크롤에서 사용).
Element.prototype.scrollIntoView ??= () => {}

// jsdom에는 matchMedia가 없어 Mantine 기반 에디터의 색상 모드 감지를 보완한다.
window.matchMedia ??= (query: string) => ({
  addEventListener: vi.fn(),
  addListener: vi.fn(),
  dispatchEvent: vi.fn(),
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: vi.fn(),
  removeListener: vi.fn(),
})

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: ReactNode }) =>
    createElement('div', { 'data-testid': 'pdf-document' }, children),
  Page: ({ pageNumber }: { pageNumber: number }) =>
    createElement('div', { 'data-testid': 'pdf-page' }, `PDF ${pageNumber}쪽`),
  pdfjs: {
    GlobalWorkerOptions: {},
  },
}))
