import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { build } from 'vite'
import type {} from './fixtures/protected-file-cache-bridge'

type Actor = { id: number; email: string }
type World = {
  label: string; instructor: Actor; student: Actor; classroomId: number; materialId: number; attachmentId: number
  pdf: string; attachment: string; pdfSha256: string; attachmentSha256: string
}
type Audit = { method: string; path: string; status: number; upstreamCacheControl?: string | null; cacheControl: string | null }
type Kind = 'PDF' | 'ATTACHMENT'
type CacheEvent = { url: string; status: number; fromDiskCache: boolean }
const password = process.env.FILE_CACHE_PASSWORD ?? 'SyntheticFileCache!only'
const backendOrigin = process.env.FILE_CACHE_BACKEND_ORIGIN
let bridge = ''
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const fileCases = (world: World) => ([
  { kind: 'PDF' as const, id: String(world.materialId), path: `/api/materials/${world.materialId}/file`, sha256: world.pdfSha256 },
  { kind: 'ATTACHMENT' as const, id: String(world.attachmentId), path: `/api/resources/${world.attachmentId}/file`, sha256: world.attachmentSha256 },
])

test.beforeAll(async () => {
  const bundle = await build({
    configFile: false, logLevel: 'error',
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
    build: {
      write: false, minify: false,
      lib: { entry: fileURLToPath(new URL('./fixtures/protected-file-cache-bridge.ts', import.meta.url)), formats: ['iife'], name: 'FileCacheBridge' },
    },
  })
  const bundles = Array.isArray(bundle) ? bundle : [bundle]
  const chunk = bundles.flatMap(item => 'output' in item ? item.output : []).find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Bridge bundle is missing')
  bridge = chunk.code
})

function worlds(): World[] {
  if (backendOrigin) {
    const configured = new URL(backendOrigin)
    if (configured.protocol !== 'http:' || configured.hostname !== '127.0.0.1') throw new Error('Only an owned loopback backend is supported')
    return JSON.parse(process.env.FILE_CACHE_BACKEND_FIXTURES ?? '[]') as World[]
  }
  return ['A', 'B'].map((label, index) => {
    const pdf = `%PDF-1.7\nSYNTHETIC_CACHE_${label}`
    const attachment = `SYNTHETIC_ATTACHMENT_${label}`
    return {
      label, instructor: { id: index * 2 + 1, email: `${label}-owner@example.test` },
      student: { id: index * 2 + 2, email: `${label}-student@example.test` },
      classroomId: index + 1, materialId: index + 11, attachmentId: index + 21,
      pdf, attachment, pdfSha256: digest(pdf), attachmentSha256: digest(attachment),
    }
  })
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function fixture() {
  const pair = worlds()
  expect(pair).toHaveLength(2)
  const audit: Audit[] = []
  const membership = new Set(pair.map(world => world.student.email))
  let legacy = true
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => { response.writeHead(500); response.end('Synthetic fixture failed') })
  })

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const path = request.url ?? '/'
    if (path === '/') {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><title>Protected file cache regression</title><script src="/bridge.js"></script>')
      return
    }
    if (path === '/bridge.js') {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'text/javascript')
      response.end(bridge)
      return
    }
    let status = 404
    let body = Buffer.from(JSON.stringify({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Synthetic missing resource' } }))
    let headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    const requestBody = await readBody(request)
    let upstreamCacheControl: string | null | undefined
    if (backendOrigin && path.startsWith('/api/')) {
      const forwarded: Record<string, string> = {}
      for (const name of ['authorization', 'content-type', 'accept']) {
        const value = request.headers[name]
        if (typeof value === 'string') forwarded[name] = value
      }
      const upstream = await fetch(`${backendOrigin}${path}`, {
        method: request.method, headers: forwarded,
        ...(requestBody.length ? { body: requestBody } : {}),
      })
      status = upstream.status
      body = Buffer.from(await upstream.arrayBuffer())
      headers = {}
      for (const name of ['Content-Type', 'Cache-Control', 'Content-Disposition', 'X-Content-Type-Options', 'Vary']) {
        const value = upstream.headers.get(name)
        if (value !== null) headers[name] = value
      }
      upstreamCacheControl = upstream.headers.get('Cache-Control')
    } else if (path === '/api/auth/login' && request.method === 'POST') {
      const login = JSON.parse(requestBody.toString()) as { email: string; password: string }
      const known = pair.some(world => [world.instructor.email, world.student.email].includes(login.email))
      status = known && login.password === password ? 200 : 401
      body = Buffer.from(JSON.stringify({ data: { accessToken: login.email } }))
    } else {
      const token = request.headers.authorization?.replace(/^Bearer /, '')
      const target = pair.find(world => fileCases(world).some(file => file.path === path))
      const removal = pair.find(world => path === `/api/classrooms/${world.classroomId}/students/${world.student.id}`)
      if (removal && request.method === 'DELETE' && token === removal.instructor.email) {
        membership.delete(removal.student.email)
        status = 200
        body = Buffer.from('{"success":true,"data":null}')
      } else if (target) {
        const allowed = token === target.instructor.email || token === target.student.email && membership.has(token)
        status = !token ? 401 : allowed ? 200 : 404
        if (allowed) {
          const pdf = path.includes('/materials/')
          body = Buffer.from(pdf ? target.pdf : target.attachment)
          headers = {
            'Content-Type': pdf ? 'application/pdf' : 'text/plain', 'Cache-Control': 'no-store, private',
            'Content-Disposition': pdf ? 'inline; filename="material.pdf"' : "attachment; filename*=UTF-8''synthetic.txt",
            'X-Content-Type-Options': 'nosniff',
          }
        }
      }
    }
    const isFile = /^\/api\/(materials|resources)\/\d+\/file$/.test(path)
    // Test-only metadata emulates an already-deployed legacy response; authorization/bytes stay upstream.
    if (legacy && isFile && status === 200) headers['Cache-Control'] = 'private, max-age=3600, immutable'
    if (path.startsWith('/api/')) audit.push({ method: request.method ?? 'GET', path, status, upstreamCacheControl, cacheControl: headers['Cache-Control'] ?? null })
    response.writeHead(status, { ...headers, 'Content-Length': body.length })
    response.end(body)
  }

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Loopback fixture failed to bind')
  return {
    pair, audit, origin: `http://127.0.0.1:${address.port}`,
    currentHeaders() { legacy = false },
    count(path: string) { return audit.filter(item => item.path === path).length },
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}

async function login(page: Page, actor: Actor) {
  expect(await page.evaluate(({ email, password }) => window.fileCacheHarness.login(email, password), { email: actor.email, password })).toBe(200)
}
async function legacy(page: Page, kind: Kind, id: string, retain = false) {
  return page.evaluate(({ kind, id, retain }) => window.fileCacheHarness.legacyDownload(kind, id, retain), { kind, id, retain })
}
async function download(page: Page, kind: Kind, id: string) {
  return page.evaluate(({ kind, id }) => window.fileCacheHarness.download(kind, id), { kind, id })
}
async function receipt(info: TestInfo, audit: Audit[], cacheEvents: CacheEvent[]) {
  await info.attach('http-cache-boundary', {
    contentType: 'application/json',
    body: JSON.stringify({ mode: backendOrigin ? 'REAL_SPRING_HTTP_WITH_LEGACY_HEADER_PROXY' : 'SYNTHETIC_HTTP', browserCacheDisabled: false, requestInterception: false, audit, cacheEvents }, null, 2),
  })
}

for (const scenario of ['membership removal', 'account switch'] as const) {
  test(`warmed legacy PDF and attachment cannot bypass ${scenario}`, async ({ page, context }, info) => {
    const origin = await fixture()
    const cacheEvents: CacheEvent[] = []
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    cdp.on('Network.responseReceived', ({ response }: { response: { url: string; status: number; fromDiskCache?: boolean } }) => {
      if (/\/api\/(materials|resources)\/\d+\/file$/.test(response.url)) cacheEvents.push({ url: response.url, status: response.status, fromDiskCache: Boolean(response.fromDiskCache) })
    })
    const target = scenario === 'membership removal' ? origin.pair[0] : origin.pair[1]
    try {
      await page.goto(origin.origin)
      await login(page, target.student)
      for (const file of fileCases(target)) {
        expect(await legacy(page, file.kind, file.id, true)).toMatchObject({ status: 200, sha256: file.sha256, cacheControl: 'private, max-age=3600, immutable' })
        const before = origin.count(file.path)
        expect(await legacy(page, file.kind, file.id)).toMatchObject({ status: 200, sha256: file.sha256 })
        expect(origin.count(file.path)).toBe(before)
      }
      expect(cacheEvents.filter(event => event.fromDiskCache)).toHaveLength(2)
      origin.currentHeaders()
      if (scenario === 'membership removal') {
        const auth = await fetch(`${origin.origin}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: target.instructor.email, password }),
        })
        expect(auth.status).toBe(200)
        const { data } = await auth.json() as { data: { accessToken: string } }
        expect((await fetch(`${origin.origin}/api/classrooms/${target.classroomId}/students/${target.student.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${data.accessToken}` },
        })).status).toBe(200)
      } else {
        await login(page, origin.pair[0].student)
      }
      for (const file of fileCases(target)) {
        const before = origin.count(file.path)
        // Negative control proves the cache remains populated after the authorization change.
        expect(await legacy(page, file.kind, file.id)).toMatchObject({ status: 200, sha256: file.sha256 })
        expect(origin.count(file.path)).toBe(before)
        expect(await download(page, file.kind, file.id)).toMatchObject({ ok: false, status: 404 })
        expect(origin.count(file.path)).toBe(before + 1)
        expect(origin.audit.at(-1)).toMatchObject({ path: file.path, status: 404 })
        // Delivered Blob bytes are deliberately outside fresh-request authorization.
        expect(await page.evaluate(({ kind, id }) => window.fileCacheHarness.readHeld(kind, id), file)).toMatchObject({ status: 200, sha256: file.sha256 })
      }
      await login(page, target.instructor)
      for (const file of fileCases(target)) {
        const before = origin.count(file.path)
        expect(await download(page, file.kind, file.id)).toMatchObject({ ok: true, status: 200, sha256: file.sha256, cacheControl: 'no-store, private' })
        expect(origin.count(file.path)).toBe(before + 1)
        if (backendOrigin) expect(origin.audit.at(-1)?.upstreamCacheControl).toBe('no-store, private')
      }
    } finally {
      await page.evaluate(() => window.fileCacheHarness?.release()).catch(() => {})
      await receipt(info, origin.audit, cacheEvents)
      await cdp.detach()
      await origin.close()
    }
  })
}

test('new no-store file responses are not saved for a later default-cache fetch', async ({ page }, info) => {
  const origin = await fixture()
  origin.currentHeaders()
  try {
    await page.goto(origin.origin)
    await login(page, origin.pair[1].instructor)
    for (const file of fileCases(origin.pair[1])) {
      const before = origin.count(file.path)
      expect(await download(page, file.kind, file.id)).toMatchObject({ ok: true, status: 200, sha256: file.sha256, cacheControl: 'no-store, private' })
      expect(await legacy(page, file.kind, file.id)).toMatchObject({ status: 200, sha256: file.sha256, cacheControl: 'no-store, private' })
      expect(await legacy(page, file.kind, file.id)).toMatchObject({ status: 200, sha256: file.sha256 })
      expect(origin.count(file.path)).toBe(before + 3)
      if (backendOrigin) expect(origin.audit.filter(item => item.path === file.path).every(item => item.upstreamCacheControl === 'no-store, private')).toBe(true)
    }
  } finally {
    await receipt(info, origin.audit, [])
    await origin.close()
  }
})
