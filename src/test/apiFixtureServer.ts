import { vi } from 'vitest'

import { handleApiFixtureRequest } from './apiFixtures'

export { apiFailure, apiSuccess } from './apiFixtures'

type ApiFixtureOverride = (
  request: Request,
) => Response | Promise<Response | undefined> | undefined

export function installApiFixtureServer(override?: ApiFixtureOverride) {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const overriddenResponse = await override?.(request)
    if (overriddenResponse) return overriddenResponse

    return handleApiFixtureRequest(request)
  })
}
