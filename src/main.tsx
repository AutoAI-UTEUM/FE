import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'

import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import './index.css'
import { registerStaleAssetRecovery } from './shared/runtime/staleAssetRecovery'

registerStaleAssetRecovery()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('루트 엘리먼트 #root를 찾을 수 없습니다.')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
