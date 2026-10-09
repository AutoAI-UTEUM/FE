import { apiRequest, ApiClientError } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth/authContext'
import { isGuardianWorkflowReady, isGuardianRequestId, parseGuardianDetail, parseGuardianList, parseGuardianLink, parseGuardianStatus, parseGuardianView } from './guardianContract'

export type GuardianCommand = 'intake' | 'link' | 'withdraw' | 'consent' | 'confirmation' | 'decision' | 'revoke'
export interface GuardianOperation { command: GuardianCommand; requestId: string | null; body: string }
export function assertGuardianWorkflowReady() {
  if (!isGuardianWorkflowReady()) throw new ApiClientError({ code: 'GUARDIAN_TEAM_UNAVAILABLE', status: 503, message: '보호자 후속 절차를 준비하고 있습니다.' })
}
export function createGuardianOperation(command: GuardianCommand, requestId: string | null, fields: Record<string, unknown>): GuardianOperation {
  assertGuardianWorkflowReady()
  if (requestId !== null && !isGuardianRequestId(requestId)) throw new ApiClientError({ code: 'INVALID_API_PATH', message: '올바른 신청을 다시 조회하세요.' })
  return Object.freeze({ command, requestId, body: JSON.stringify({ ...fields, idempotencyKey: crypto.randomUUID() }) })
}
export async function sendGuardianOperation(request: AuthenticatedRequest, operation: GuardianOperation, signal: AbortSignal) {
  assertGuardianWorkflowReady()
  const { command, requestId, body } = operation
  const base = command === 'consent' ? '/api/auth/guardian-team/consent' : command === 'intake' ? '/api/users/me/guardian-requests'
    : ['link', 'withdraw'].includes(command) ? `/api/users/me/guardian-requests/${requestId}/${command}` : `/api/admin/guardian-requests/${requestId}/${command}`
  if (!['intake', 'consent'].includes(command) && (!requestId || !isGuardianRequestId(requestId))) throw new ApiClientError({ code: 'INVALID_API_PATH', message: '올바른 신청을 다시 조회하세요.' })
  const { data } = await (command === 'consent' ? apiRequest : request)<unknown>(base, {
    method: 'POST', body, signal, cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' }, ...(command === 'consent' ? { credentials: 'omit' as const } : {}),
  })
  return command === 'intake' ? parseGuardianView(data) : command === 'link' ? parseGuardianLink(data) : parseGuardianStatus(data)
}
export async function getPublicGuardianView(token: string, signal: AbortSignal) {
  assertGuardianWorkflowReady()
  const { data } = await apiRequest<unknown>('/api/auth/guardian-team/view', { method: 'POST', body: { token }, credentials: 'omit', signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
  return parseGuardianView(data)
}
export async function getGuardianReviewList(request: AuthenticatedRequest, page: number, signal: AbortSignal) {
  assertGuardianWorkflowReady()
  const { data } = await request<unknown>(`/api/admin/guardian-requests?page=${page}&size=20`, { method: 'GET', signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
  return parseGuardianList(data)
}
export async function getGuardianReviewDetail(request: AuthenticatedRequest, id: string, signal: AbortSignal) {
  assertGuardianWorkflowReady()
  if (!isGuardianRequestId(id)) throw new ApiClientError({ code: 'INVALID_API_PATH', message: '올바른 신청을 다시 조회하세요.' })
  const { data } = await request<unknown>(`/api/admin/guardian-requests/${id}`, { method: 'GET', signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
  return parseGuardianDetail(data)
}
