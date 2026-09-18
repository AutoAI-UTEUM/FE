import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { handleApiFixtureRequest } from '../src/test/apiFixtures'

/**
 * dev 전용 mock API — `VITE_DEV_PROXY_TARGET=mock`일 때만 등록된다.
 *
 * 배포 dev 서버는 ai-service 미배포라 자료가 READY에 도달하지 못하고,
 * 그래서 세션을 만들 수 없어 학습 루프 화면을 브라우저로 조작할 수 없다.
 * 테스트와 같은 픽스처를 그대로 서빙해 전 화면 QA를 가능하게 한다.
 */
export function mockApiPlugin(): Plugin {
  const installMiddleware = (middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void }) => {
    middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api')) {
        next()
        return
      }
      void respond(req, res)
    })
  }

  return {
    name: 'edupilot-mock-api',
    configureServer(server) {
      installMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      installMiddleware(server.middlewares)
    },
  }
}

async function respond(req: IncomingMessage, res: ServerResponse) {
  try {
    const response = await handleApiFixtureRequest(await toWebRequest(req), {
      mode: 'dev',
    })
    res.statusCode = response.status
    res.setHeader(
      'content-type',
      response.headers.get('content-type') ?? 'application/json',
    )
    res.end(await response.text())
  } catch (error) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        error: {
          code: 'MOCK_FIXTURE_FAILURE',
          details: [],
          message: error instanceof Error ? error.message : String(error),
        },
        success: false,
      }),
    )
  }
}

// 픽스처가 읽는 헤더만 전달한다(connection·content-length 등은 Headers에서 금지).
const FORWARDED_HEADERS = ['accept', 'authorization', 'content-type', 'cookie']

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const method = req.method ?? 'GET'
  const headers = new Headers()

  for (const name of FORWARDED_HEADERS) {
    const value = req.headers[name]
    if (typeof value === 'string') headers.set(name, value)
  }

  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    body: hasBody ? await readBody(req) : undefined,
    headers,
    method,
  })
}

function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    req.on('data', (chunk: Uint8Array) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
