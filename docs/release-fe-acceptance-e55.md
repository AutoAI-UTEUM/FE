# FE release acceptance — develop de2854e (includes e55bb9c2)

## Scope and evidence semantics

- Branch: `validate/release-fe-auth-security-e55`; validation base `de2854ee0162a51bf7e3f9880fe0bbc7dab3943c`.
- Authentication, administration, password-reset, and authorization traffic used synthetic Vitest or Playwright mocks. No real account, credential, email, security-setting mutation, permission grant, or deletion was used.
- Settings preferences and feature flags were not changed.
- `PASS-SCENARIO` means only the named FE scenario passed. It does not claim that every acceptance condition under the canonical requirement ID passed.
- `UNMAPPED-SUPPORT` is supporting hardening that does not establish a canonical requirement.
- `NOTRUN-REQUIREMENT` means the canonical requirement needs unavailable backend, gateway, or live-service evidence.

## Canonical acceptance matrix

| Canonical ID / evidence label | Status | Verified behavior | Evidence |
| --- | --- | --- | --- |
| AUTH-02 | PASS-SCENARIO | Password login 400/401/409/429 responses retain input, issue one request, expose expected feedback, and re-enable the submit control for a retry. Repeated password submits are locked. A second retry request is not asserted by this scenario. | `src/app/pages/LoginPage.test.tsx` status/input-preservation and duplicate-submit tests. |
| AUTH-06 | PASS-SCENARIO | Google credentials are ignored while password authentication is pending, and password submit is ignored while Google authentication is pending. | `src/app/pages/LoginPage.test.tsx` cross-provider pending-attempt tests. No real OAuth was used. |
| AUTH-03 | PASS-SCENARIO | Cross-tab logout wins over delayed identity work; lower-revision logout clears an older tab; tabs restore safely around delayed `getMe`. | `src/features/auth/AuthProvider.multitab.test.tsx`; `e2e/auth-multitab.spec.ts`. |
| AUTH-04 | PASS-SCENARIO | Reset links cover successful completion, expired/reused tokens, 500 retry, duplicate confirmation, token replacement, URL scrubbing, Back/Forward, unmount, and late responses. | `src/app/pages/PasswordResetSafety.test.tsx`. No real email or password was used. |
| Auth account-transition hardening | UNMAPPED-SUPPORT | Replacement grants are re-identified before commit. Request retry and refresh application are bound to the starting session transition/owner. Known stale-owner and unidentified grants are rejected for established/pending identities; a superseded local refresh is not applied or broadcast and cannot resend the original request after account change/logout. Replacement identity lookup times out fail-closed. | `src/features/auth/AuthProvider.multitab.test.tsx`: JSON/raw, signal/no-signal, unidentified-grant, pending-owner logout, replacement-timeout, delayed-refresh, logout, and concurrent-refresh tests; mock browser matrix. |
| ADMIN-01 | PASS-SCENARIO | 401 ends/re-authenticates a session; 403 admin denial guides re-login; scoped 403/404 report denial cannot revive previous-scope data. | `src/features/auth/AuthProvider.test.tsx`; `src/app/App.test.tsx`; `src/app/pages/instructor/InstructorReportsPage.test.tsx`. |
| ADMIN-07 | PASS-SCENARIO | Temporary-password reset confirms once and permits only one request while pending. | `src/app/pages/admin/AdminPage.test.tsx`; synthetic responses only. |
| DATA-07 | PASS-SCENARIO | Identity/scope changes isolate prior-owner data and hide late prior-owner responses. | Instructor reports/calendar tests and `src/features/calendar/calendarEvents.test.tsx`. |
| SEC-01 | NOTRUN-REQUIREMENT | Canonical API isolation acceptance was not established by these FE tests. Memory-only access-grant handling is supporting client hardening only. | Real service/gateway isolation was outside the synthetic-only scope. Supporting FE evidence exists in App/AuthProvider unit and multitab tests. |
| SEC-02 | NOTRUN-REQUIREMENT | Canonical rate-limit acceptance was not established by these FE tests. Safe return-target and reset-token URL handling are supporting client hardening only. | Real rate-limit enforcement was outside the synthetic-only scope. Supporting FE evidence: `authReturnTarget.test.ts`, `PasswordResetSafety.test.tsx`. |
| SEC-05 | PASS-SCENARIO | `javascript:` Markdown links are not activated and raw HTML/script/event-handler content is not rendered. | `src/shared/ui/ui.test.tsx` malicious Markdown/HTML test. |
| Redacted error reporting | UNMAPPED-SUPPORT | Application and React root error handlers do not forward token-bearing `Error` message/name values to `console.error`. | `src/app/AppErrorBoundary.test.tsx`; `src/main.tsx` root callbacks. |
| SEC-07 | PASS-SCENARIO | Read-only dependency and tracked-source filename checks found no vulnerability or candidate secret file in the recorded verification. | `npm audit --audit-level=low`; tracked-source filename scan. This is not a host-level deep security scan. |
| OPS-04 | PASS-SCENARIO | QA production build succeeds against mock/local capability configuration without a live API target. | `npm run build:qa`; mock Playwright. Existing large-chunk warning remains non-blocking. |
| QA-01 | PASS-SCENARIO | Repository lint, type checking, full unit/integration tests, build, and mock auth-browser matrix pass on the final branch head. | Final command results recorded on the PR/CI checks. |

## Failure-first fixes

1. `LoginPage` allowed duplicate password requests and Google/password overlap before pending state committed. A synchronous per-page attempt guard now locks both entry points.
2. Admin password reset allowed repeated confirmations while the first request was pending. A synchronous request guard and `aria-busy` pending region were added.
3. Application/root error reporting could expose mutable error names/messages. The shared reporter logs only a constant type and component stack.
4. Account replacement could commit or trust a stale grant depending on BroadcastChannel order. Replacement identity is now verified before session commit.
5. Authenticated JSON/raw requests capture their starting session transition/owner and fail closed if it changes before refresh/retry.
6. Refresh coordination validates the starting transition after lock settlement and after the network refresh; a superseded result is neither applied nor broadcast.
7. The multiviewport auth E2E logout helper now scopes actions to the active accessible navigation region.
8. An unidentified bootstrap refresh broadcast could be attached to an established different-user session. Established and pending identities now reject unidentified grants while anonymous bootstrap deduplication remains intact.
9. A previous account's late logout could clear a pending verified account replacement. Coordinator ownership checks now include the pending user ID.
10. Replacement identity lookup could remain pending indefinitely. It now aborts and fails closed after `AUTH_RESTORE_TIMEOUT_MS`.
11. A newer account switch arriving during pending identity replacement could dereference a missing current session. Freshness comparison now uses the current or pending grant timestamp, and consecutive B→C replacement is covered asynchronously.

## Explicitly not run

| Item | Status | Reason |
| --- | --- | --- |
| Canonical SEC-01 API isolation | NOTRUN-REQUIREMENT | Requires backend/gateway or live environment evidence not represented by client memory handling. |
| Canonical SEC-02 rate limiting | NOTRUN-REQUIREMENT | Requires backend/gateway enforcement evidence; no real rate-limit service was exercised. |
| Real login, Google OAuth, mail delivery, credential/password change | NOTRUN | Prohibited; all flows used synthetic identities and mocks. |
| Live authorization/security-setting changes or permanent deletion | NOTRUN | Prohibited. |
| Host-level deep security scanner | NOTRUN | Scanner resources were unavailable; read-only dependency/source checks are not represented as a deep-scan pass. |

## Verification commands

```text
VITE_API_BASE_URL=/api VITE_API_CAPABILITIES=reports,policy-consent npm run test:run
npm run typecheck
npm run lint
npm run build:qa
npm run test:e2e:mock -- e2e/auth-multitab.spec.ts
```
