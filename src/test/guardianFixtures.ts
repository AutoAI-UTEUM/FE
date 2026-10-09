import type { GuardianDetail, GuardianEntry, GuardianStatus, GuardianView } from '../features/guardian/guardianContract'

export const guardianStatus: GuardianStatus = {
  requestId: '00000000-0000-4000-8000-000000000001', generation: 2, revision: 3,
  state: 'DECLARED', noticeVersion: 'synthetic-v1', noticeDigest: 'a'.repeat(64),
  requestExpiresAt: '2026-10-09T01:00:00Z', contactEraseDueAt: null,
  webDeclaredAt: '2026-10-08T01:00:00Z', explicitResponseAt: null, approvedUntil: null,
  currentNotice: true, serviceApproved: false, externalAiApproved: false, reason: null,
}
export const guardianView: GuardianView = { status: guardianStatus, noticeUrl: null, requiredScopes: ['SERVICE'],
  optionalAiScope: 'EXTERNAL_AI', replyChannel: 'PHONE_CALLBACK', forms: { review_pending: '합성 담당자 검토 안내', reply_form: '<img src=x onerror=alert(1)> 합성 텍스트' } }
export const guardianEntry: GuardianEntry = { requirement: 'REQUIRED', teamReviewAvailable: true,
  canStartRequest: false, replyChannel: 'EMAIL_REPLY', request: guardianView }
export const guardianDetail: GuardianDetail = { status: guardianStatus, userId: 900001, guardianName: null,
  guardianContact: null, contactOrigin: 'NONE', generationStartedAt: '2026-10-07T01:00:00Z', declaredScopes: [],
  replyChannel: 'PHONE_CALLBACK', relationship: null, confirmationMethod: null, evidenceReference: null, events: [], forms: {} }
export const guardianPendingUser = { id: 900001, email: 'synthetic@example.invalid', name: '합성 계정', role: 'LEARNER',
  emailVerification: 'PENDING' as const, emailVerificationRequired: true }
