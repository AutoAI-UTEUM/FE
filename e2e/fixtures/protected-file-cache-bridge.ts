import { rawApiRequest } from '../../src/shared/api/rawApiClient'
import { createMaterialsRepository } from '../../src/features/materials/materialsRepository'
import { createClassroomResourcesRepository } from '../../src/features/classroomResources/classroomResourcesRepository'

type Kind = 'PDF' | 'ATTACHMENT'
type Download = { ok: boolean; status: number; sha256?: string; cacheControl?: string | null; code?: string }
let token = ''
const held = new Map<string, string>()
const unusedJson = async () => { throw new Error('This fixture only uses binary repositories') }
let lastResponse: Response | undefined
const raw: typeof rawApiRequest = async (path, options) => {
  lastResponse = await rawApiRequest(path, { ...options, accessToken: token })
  return lastResponse
}
const materials = createMaterialsRepository(unusedJson as never, raw)
const resources = createClassroomResourcesRepository(unusedJson as never, raw)
const path = (kind: Kind, id: string) => `/api/${kind === 'PDF' ? 'materials' : 'resources'}/${id}/file`
const sha256 = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256', await blob.arrayBuffer(),
)), value => value.toString(16).padStart(2, '0')).join('')

export const fileCacheHarness = {
  async login(email: string, password: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) throw new Error(`Synthetic login failed: ${response.status}`)
    token = (await response.json()).data.accessToken
    return response.status
  },
  // The old transport is a control: it warms and proves reuse of a real HTTP cache entry.
  async legacyDownload(kind: Kind, id: string, retain = false): Promise<Download> {
    const response = await rawApiRequest(path(kind, id), {
      accessToken: token, ...(kind === 'PDF' ? { headers: { Accept: 'application/pdf' } } : {}),
    })
    const blob = await response.blob()
    if (retain) held.set(path(kind, id), URL.createObjectURL(blob))
    return { ok: true, status: response.status, sha256: await sha256(blob), cacheControl: response.headers.get('Cache-Control') }
  },
  async download(kind: Kind, id: string): Promise<Download> {
    try {
      const blob = kind === 'PDF' ? await materials.getFile(id) : await resources.getFile(id)
      return { ok: true, status: lastResponse!.status, sha256: await sha256(blob), cacheControl: lastResponse!.headers.get('Cache-Control') }
    } catch (error) {
      const failure = error as { status: number; code: string }
      return { ok: false, status: failure.status, code: failure.code }
    }
  },
  async readHeld(kind: Kind, id: string) {
    const url = held.get(path(kind, id))
    if (!url) throw new Error('No held synthetic Blob')
    const response = await fetch(url)
    return { status: response.status, sha256: await sha256(await response.blob()) }
  },
  release() {
    for (const url of held.values()) URL.revokeObjectURL(url)
    held.clear()
  },
}

declare global {
  interface Window { fileCacheHarness: typeof fileCacheHarness }
}
window.fileCacheHarness = fileCacheHarness
