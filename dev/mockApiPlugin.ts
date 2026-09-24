import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { randomUUID } from 'node:crypto'
import { handleTabletFixture } from './tabletFixtures'

import { handleApiFixtureRequest } from '../src/test/apiFixtures'

const sessions = new Map<string, Record<string, unknown>>()

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
    const request = await toWebRequest(req)
    const path = new URL(request.url).pathname
    const sessionId = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('uteum_mock='))?.slice('uteum_mock='.length)
    const user = sessionId ? sessions.get(sessionId) : undefined
    if (path === '/api/auth/refresh' && !user) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: { code: 'TOKEN_INVALID', message: 'Mock signed out', details: [] } }))
      return
    }
    if (path === '/api/users/me' && request.method === 'GET' && user) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ success: true, data: user, message: 'Mock session restored' }))
      return
    }
    const response = await handleTabletFixture(request.clone(), String(user?.email ?? 'audit')) ?? await handleApiFixtureRequest(request, {
      mode: 'dev',
    })
    if (path === '/api/auth/login' && response.ok) {
      const payload = await response.clone().json() as { data: { user: Record<string, unknown> } }
      const id = randomUUID()
      if (sessionId) sessions.delete(sessionId)
      sessions.set(id, payload.data.user)
      res.setHeader('set-cookie', `uteum_mock=${id}; Path=/api; HttpOnly; SameSite=Lax`)
    }
    if (path === '/api/auth/logout') {
      if (sessionId) sessions.delete(sessionId)
      res.setHeader('set-cookie', 'uteum_mock=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0')
    }
    res.statusCode = response.status
    res.setHeader(
      'content-type',
      response.headers.get('content-type') ?? 'application/json',
    )
    res.end(Buffer.from(await response.arrayBuffer()))
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
