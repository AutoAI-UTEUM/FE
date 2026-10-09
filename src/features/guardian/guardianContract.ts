import { ApiClientError } from '../../shared/api'

/** Preparation only. This value is absent from deployment configuration. */
export const GUARDIAN_TEAM_CONTRACT = 'be-guardian-461b8533-v1'
export const isGuardianTeamReady = () => import.meta.env.VITE_GUARDIAN_TEAM_READINESS === GUARDIAN_TEAM_CONTRACT
export const GUARDIAN_WORKFLOW_CONTRACT = 'be-guardian-workflows-29259371-v1'
export const GUARDIAN_POLICY_REVIEW = 'guardian-policy-review-attested-v1'
export const isGuardianWorkflowReady = () => isGuardianTeamReady() && import.meta.env.VITE_GUARDIAN_WORKFLOW_READINESS === GUARDIAN_WORKFLOW_CONTRACT && import.meta.env.VITE_GUARDIAN_POLICY_REVIEW_READINESS === GUARDIAN_POLICY_REVIEW

const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
export function isGuardianManagementRequest(path: string, method = 'GET'): boolean {
  if (!isGuardianTeamReady()) return false
  const pathname = path.split('?')[0]
  if (isGuardianWorkflowReady() && method.toUpperCase() === 'POST' &&
      (pathname === '/api/users/me/guardian-requests' || new RegExp(`^/api/users/me/guardian-requests/${uuidPattern}/link$`).test(pathname))) return true
  return (method.toUpperCase() === 'GET' &&
    ['/api/users/me/guardian-requests/entry', '/api/users/me/guardian-requests'].includes(pathname)) ||
    (method.toUpperCase() === 'POST' && new RegExp(`^/api/users/me/guardian-requests/${uuidPattern}/withdraw$`).test(pathname))
}

export type GuardianRequirement = 'REQUIRED' | 'NOT_REQUIRED' | 'BIRTHDATE_REQUIRED'
export type GuardianReplyChannel = 'EMAIL_REPLY' | 'PHONE_CALLBACK'
export type GuardianConfirmationMethod = 'EMAIL_REPLY' | 'PHONE'
export type GuardianScope = 'SERVICE' | 'EXTERNAL_AI'
const guardianReasons = ['APPROVED', 'INCOMPLETE_RESPONSE', 'RELATIONSHIP_UNCONFIRMED', 'CONSENT_DECLINED', 'REQUESTER_WITHDREW', 'OPERATOR_REVOKED', 'DEADLINE_EXPIRED', 'ACCOUNT_WITHDRAWN', 'NOTICE_CHANGED'] as const
export const guardianStates = ['AWAITING_CONSENT', 'DECLARED', 'REVIEW_PENDING', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED', 'WITHDRAWN'] as const
export type GuardianState = typeof guardianStates[number]
export interface GuardianStatus {
  requestId: string
  generation: number
  revision: number
  state: GuardianState
  noticeVersion: string
  noticeDigest: string
  requestExpiresAt: string | null
  contactEraseDueAt: string | null
  webDeclaredAt: string | null
  explicitResponseAt: string | null
  approvedUntil: string | null
  currentNotice: boolean
  serviceApproved: boolean
  externalAiApproved: boolean
  reason: typeof guardianReasons[number] | null
}
export interface GuardianView {
  status: GuardianStatus
  noticeUrl: string | null
  requiredScopes: GuardianScope[]
  optionalAiScope: GuardianScope | null
  replyChannel: GuardianReplyChannel | null
  forms: Record<string, string>
}
export interface GuardianEntry {
  requirement: GuardianRequirement
  teamReviewAvailable: boolean
  canStartRequest: boolean
  replyChannel: GuardianReplyChannel | null
  request: GuardianView | null
}
/** Reviewer-only fields: never spread this object into a self/public View. */
export interface GuardianDetail {
  status: GuardianStatus
  userId: number | null
  guardianName: string | null
  guardianContact: string | null
  contactOrigin: 'NONE' | 'CHILD' | 'GUARDIAN' | null
  generationStartedAt: string | null
  declaredScopes: GuardianScope[]
  replyChannel: GuardianReplyChannel | null
  relationship: 'PARENT' | 'MINOR_GUARDIAN' | null
  confirmationMethod: GuardianConfirmationMethod | null
  evidenceReference: string | null
  events: { generation: number; revision: number; type: string; state: GuardianState; actorId: number | null; at: string | null }[]
  forms: Record<string, string>
}
export interface GuardianLink { url: string | null; expiresAt: string | null; replayed: boolean; status: GuardianStatus }
export interface GuardianMutation { idempotencyKey: string; generation: number; revision: number }
export type GuardianRelationship = 'PARENT' | 'MINOR_GUARDIAN'
export interface GuardianList { content: GuardianStatus[]; page: number; size: number; totalElements: number; totalPages: number }
export function isGuardianRequestId(value: string): boolean { return new RegExp(`^${uuidPattern}$`).test(value) }
export function isGuardianPending(status: GuardianStatus): boolean { return ['AWAITING_CONSENT', 'DECLARED', 'REVIEW_PENDING', 'NEEDS_INFORMATION'].includes(status.state) }
export function parseGuardianList(value: unknown): GuardianList {
  const v = object(value)
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : invalid()
  if (!Array.isArray(v.content)) invalid()
  return { content: v.content.map(parseGuardianStatus), page: nonnegative(v.page), size: positive(v.size), totalElements: nonnegative(v.totalElements), totalPages: nonnegative(v.totalPages) }
}

export function confirmationMethodFor(channel: GuardianReplyChannel | null): GuardianConfirmationMethod | null {
  return channel === 'PHONE_CALLBACK' ? 'PHONE' : channel === 'EMAIL_REPLY' ? 'EMAIL_REPLY' : null
}
export function guardianLinkMessage(link: GuardianLink): string {
  return link.url === null ? '이 응답에는 새 링크가 없습니다. 현재 신청 상태를 다시 확인해 주세요.'
    : '링크 정보가 반환되었습니다. 발송이나 승인을 의미하지 않습니다.'
}

type JsonObject = Record<string, unknown>
function invalid(): never { throw new ApiClientError({ code: 'INVALID_RESPONSE', message: '보호자 확인 응답을 확인할 수 없습니다.' }) }
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as JsonObject
}
function string(value: unknown): string { return typeof value === 'string' ? value : invalid() }
function nullableString(value: unknown): string | null { return value === null ? null : string(value) }
function boolean(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid() }
function positive(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid() }
function nullableId(value: unknown): number | null { return value === null ? null : positive(value) }
function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : invalid()
}
function timestamp(value: unknown): string | null {
  const text = nullableString(value)
  if (text !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text) || !Number.isFinite(Date.parse(text)))) invalid()
  return text
}
const replyChannel = (value: unknown) => value === null ? null : enumValue(value, ['EMAIL_REPLY', 'PHONE_CALLBACK'] as const)
const scope = (value: unknown) => enumValue(value, ['SERVICE', 'EXTERNAL_AI'] as const)
// BE optionalAiReady uses Java String.isBlank for an absent optional scope.
function optionalScope(value: unknown): GuardianScope | null {
  if (value === null) return null
  if (typeof value === 'string' && [...value].every((character) => {
    const code = character.charCodeAt(0)
    return (code >= 9 && code <= 13) || (code >= 28 && code <= 32) ||
      /^[\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]$/.test(character)
  })) return null
  return scope(value)
}
function scopes(value: unknown): GuardianScope[] { return Array.isArray(value) ? value.map(scope) : invalid() }
function forms(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(object(value)).map(([key, value]) => [key, string(value)]))
}
export function parseGuardianStatus(value: unknown): GuardianStatus {
  const v = object(value)
  const requestId = string(v.requestId)
  if (!new RegExp(`^${uuidPattern}$`).test(requestId)) invalid()
  const status = { requestId, generation: positive(v.generation), revision: positive(v.revision),
    state: enumValue(v.state, guardianStates), noticeVersion: string(v.noticeVersion), noticeDigest: string(v.noticeDigest),
    requestExpiresAt: timestamp(v.requestExpiresAt), contactEraseDueAt: timestamp(v.contactEraseDueAt),
    webDeclaredAt: timestamp(v.webDeclaredAt), explicitResponseAt: timestamp(v.explicitResponseAt), approvedUntil: timestamp(v.approvedUntil),
    currentNotice: boolean(v.currentNotice), serviceApproved: boolean(v.serviceApproved), externalAiApproved: boolean(v.externalAiApproved),
    reason: v.reason === null ? null : enumValue(v.reason, guardianReasons) }
  if ((status.state !== 'APPROVED' && (status.serviceApproved || status.externalAiApproved)) ||
      (status.externalAiApproved && !status.serviceApproved) ||
      (!status.currentNotice && (status.serviceApproved || status.externalAiApproved))) invalid()
  return status
}
export function parseGuardianView(value: unknown): GuardianView {
  const v = object(value)
  return { status: parseGuardianStatus(v.status), noticeUrl: nullableString(v.noticeUrl), requiredScopes: scopes(v.requiredScopes),
    optionalAiScope: optionalScope(v.optionalAiScope), replyChannel: replyChannel(v.replyChannel), forms: forms(v.forms) }
}
export function parseGuardianEntry(value: unknown): GuardianEntry {
  const v = object(value)
  const entry = { requirement: enumValue(v.requirement, ['REQUIRED', 'NOT_REQUIRED', 'BIRTHDATE_REQUIRED'] as const),
    teamReviewAvailable: boolean(v.teamReviewAvailable), canStartRequest: boolean(v.canStartRequest),
    replyChannel: replyChannel(v.replyChannel), request: v.request === null ? null : parseGuardianView(v.request) }
  if ((!entry.teamReviewAvailable && (entry.canStartRequest || entry.replyChannel !== null || entry.request !== null)) ||
      (entry.requirement !== 'REQUIRED' && entry.canStartRequest)) invalid()
  return entry
}
export function parseGuardianDetail(value: unknown): GuardianDetail {
  const v = object(value)
  if (!Array.isArray(v.events)) invalid()
  return { status: parseGuardianStatus(v.status), userId: nullableId(v.userId), guardianName: nullableString(v.guardianName),
    guardianContact: nullableString(v.guardianContact), contactOrigin: v.contactOrigin === null ? null : enumValue(v.contactOrigin, ['NONE', 'CHILD', 'GUARDIAN'] as const), generationStartedAt: timestamp(v.generationStartedAt),
    declaredScopes: scopes(v.declaredScopes), replyChannel: replyChannel(v.replyChannel),
    relationship: v.relationship === null ? null : enumValue(v.relationship, ['PARENT', 'MINOR_GUARDIAN'] as const),
    confirmationMethod: v.confirmationMethod === null ? null : enumValue(v.confirmationMethod, ['EMAIL_REPLY', 'PHONE'] as const),
    evidenceReference: nullableString(v.evidenceReference), forms: forms(v.forms),
    events: v.events.map((event) => { const e = object(event); return { generation: positive(e.generation), revision: positive(e.revision),
      type: string(e.type), state: enumValue(e.state, guardianStates), actorId: nullableId(e.actorId), at: timestamp(e.at) } }) }
}
export function parseGuardianLink(value: unknown): GuardianLink {
  const v = object(value)
  return { url: nullableString(v.url), expiresAt: timestamp(v.expiresAt), replayed: boolean(v.replayed), status: parseGuardianStatus(v.status) }
}
