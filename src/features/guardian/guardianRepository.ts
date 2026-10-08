import { ApiClientError } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth/authContext'
import { isGuardianTeamReady, parseGuardianEntry, parseGuardianView } from './guardianContract'

function assertReady() {
  if (!isGuardianTeamReady()) throw new ApiClientError({ code: 'GUARDIAN_TEAM_UNAVAILABLE', status: 503,
    message: '보호자 팀 확인 절차를 준비하고 있습니다.' })
}
// Read-only preparation. Intake/link/consent/withdraw/admin writes are deliberately
// absent. All state remains in the page's memory and disappears on exit.
export async function getGuardianEntry(request: AuthenticatedRequest, signal?: AbortSignal) {
  assertReady()
  const { data } = await request<unknown>('/api/users/me/guardian-requests/entry', {
    method: 'GET', signal, cache: 'no-store', referrerPolicy: 'no-referrer',
  })
  return parseGuardianEntry(data)
}
export async function getGuardianRequest(request: AuthenticatedRequest, signal?: AbortSignal) {
  assertReady()
  const { data } = await request<unknown>('/api/users/me/guardian-requests', {
    method: 'GET', signal, cache: 'no-store', referrerPolicy: 'no-referrer',
  })
  return parseGuardianView(data)
}
