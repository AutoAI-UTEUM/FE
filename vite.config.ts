import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

import { mockApiPlugin } from './dev/mockApiPlugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 로컬 dev에서 /api 요청을 프록시할 백엔드.
  // 기본은 배포 dev 서버이며, 로컬 Spring을 쓰려면 VITE_DEV_PROXY_TARGET으로 지정.
  // 'mock'이면 프록시 대신 테스트 픽스처를 그대로 서빙한다(브라우저 QA용).
  const proxyTarget =
    env.VITE_DEV_PROXY_TARGET || 'https://dev.uteum.com'
  const useMockApi = proxyTarget === 'mock'

  return {
    build: {
      rollupOptions: {
        output: {
          assetFileNames(assetInfo) {
            const pattern = 'assets/[name]-[hash][extname]'

            // The dev Nginx serves .mjs as application/octet-stream, which
            // browsers reject for PDF.js module workers.
            return assetInfo.name?.endsWith('.mjs')
              ? 'assets/[name]-[hash].js'
              : pattern
          },
        },
      },
    },
    plugins: [react(), tailwindcss(), ...(useMockApi ? [mockApiPlugin()] : [])],
    server: {
      port: 5173,
      strictPort: true,
      ...(useMockApi
        ? {}
        : {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
                cookieDomainRewrite: 'localhost',
                configure(proxy) {
                  proxy.on('proxyReq', (proxyRequest) => {
                    // The browser talks to Vite on the same origin. Do not forward its
                    // localhost Origin to the remote API's CORS filter.
                    proxyRequest.removeHeader('origin')
                  })
                },
              },
            },
          }),
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      restoreMocks: true,
    },
  }
})
