# FE release acceptance — develop e578dbe (includes e55bb9c2)

## Scope and isolation

- Worktree: `task-10`, branch `validate/release-fe-auth-security-e55`
- Base: `e578dbe6ba2c` (`origin/develop`; includes required `e55bb9c2e63fdf`)
- All authentication, administration, password-reset, and authorization requests were intercepted by Vitest fetch mocks or Playwright route mocks. No real account, credential, email, security-setting mutation, permission grant, deletion, merge, or deployment was used.
- Settings preferences were not changed.
- The ID mapping below follows the scenarios delegated for this verification; it does not redefine the release criteria.
- A separate agent completed the final diff review after the failure-first fixes and found no remaining blocking, High, or Medium issue.

## Acceptance matrix

| ID | Status | Verified behavior | Evidence |
| --- | --- | --- | --- |
| AUTH-02 | PASS | Password login 400/401/409/429 errors preserve the entered email/password, issue one request, expose the expected field/server feedback, and permit an explicit retry. | `src/app/pages/LoginPage.test.tsx` — status matrix and input-preservation test; final full Vitest run. |
| AUTH-03 | PASS | Repeated password submits are locked; Google credentials are ignored while password auth is pending; password submit is ignored while Google auth is pending. | `src/app/pages/LoginPage.test.tsx` — `locks duplicate password submissions...` and `ignores password submission while Google authentication is pending`. These tests failed before the `LoginPage` lock and pass after it. |
| AUTH-04 | PASS | Cross-tab logout wins over delayed identity responses; a lower-revision logout still clears an older tab; both tabs restore safely around delayed `getMe`. | `src/features/auth/AuthProvider.multitab.test.tsx` (expanded suite 8/8; the seven-test race suite also passed 10 repeated runs = 70/70); `e2e/auth-multitab.spec.ts` (3 viewports, 9/9); delayed phone restore repeated 5/5. |
| AUTH-05 | PASS | Reset links cover valid completion, expired/reused token errors, 500 retry, duplicate confirmation, token replacement, URL token scrubbing, Back/Forward, unmount, and late responses. | `src/app/pages/PasswordResetSafety.test.tsx`; final full Vitest run. No real mail or password was used. |
| AUTH-06 | PASS | A replacement grant is re-identified before session commit. Explicit `session-start` and `refresh` messages prevent late old-account refreshes both before and after the switch from restoring the old account. A legacy different-user message clears the visible identity without trusting its grant. | `src/features/auth/AuthProvider.multitab.test.tsx` — replacement-account, rejected-old-token, before/after late-refresh, and legacy-message tests; mock Playwright matrix. |
| ADMIN-01 | PASS | 401 ends/re-authenticates the session; 403 admin denial guides re-login; 403/404 scoped report denial does not revive late data from the previous scope. | `src/features/auth/AuthProvider.test.tsx`; `src/app/App.test.tsx`; `src/app/pages/instructor/InstructorReportsPage.test.tsx` 403/404 matrix. |
| ADMIN-07 | PASS | Admin temporary-password reset asks for confirmation once and accepts only one reset request while pending, including repeated clicks. | `src/app/pages/admin/AdminPage.test.tsx` — pending repeated-confirm test. It failed before the request guard and passes after it. Only synthetic responses were used. |
| DATA-07 | PASS | Identity/scope changes clear or isolate data from the prior owner; late prior-owner responses remain hidden. | `src/app/pages/instructor/InstructorReportsPage.test.tsx` — authenticated-owner change and 403/404 late-response tests; `src/app/pages/instructor/InstructorCalendarPage.test.tsx`; `src/features/calendar/calendarEvents.test.tsx`. |
| SEC-01 | PASS | Access grants remain in memory; terminal 401/logout clears the session; delayed identity results cannot restore it. | `src/app/App.test.tsx` — DEC-004 memory-only test; `src/features/auth/AuthProvider.test.tsx`; multitab unit/E2E tests. |
| SEC-02 | PASS | Sensitive or external return targets are rejected; reset-token query parameters are scrubbed while unrelated query/hash/router state is preserved; Back/Forward cannot reuse credentials. | `src/features/auth/authReturnTarget.test.ts`; `src/app/pages/PasswordResetSafety.test.tsx`. |
| SEC-03 | PASS | `javascript:` Markdown links are not activated and raw HTML/script/event-handler content is not rendered. | `src/shared/ui/ui.test.tsx` — `does not activate malicious markdown links or raw HTML`. |
| SEC-05 | PASS | Neither the application boundary nor React 19's root caught/uncaught error callbacks pass a token-bearing Error message/name to `console.error`; only constant error type plus component stack are logged. | `src/app/AppErrorBoundary.test.tsx`; `src/main.tsx` root callbacks. Failure-first covered both message and mutable `Error.name`, and the final test inspects all console calls. |
| SEC-07 | PASS | Read-only dependency and tracked-source secret checks found no vulnerability or candidate secret file. | `npm audit --audit-level=low`: 0 vulnerabilities; filename-only tracked-source pattern scan: 0 candidate files and 0 tracked non-example `.env` files. |
| OPS-04 | PASS | QA production build succeeds with the repository's mock capability configuration; no live API target was used. | `npm run build:qa`; Playwright `QA_ENV=mock`. Existing bundle-size warning remains non-blocking. |
| QA-01 | PASS | Full CI-configured unit/integration suite, type checking, lint, build, and auth browser matrix pass. | Final standalone Vitest: 92 files / 794 tests; `tsc -b`; warning-free `eslint .`; QA build; Playwright 9/9. |

## Failure-first defects and minimal fixes

1. `LoginPage` allowed two password requests and allowed Google/password overlap before React committed pending state. Added a synchronous per-page auth-attempt guard and disabled both entry points during either attempt.
2. Admin password reset allowed repeated confirmations and requests while the first request was pending. Added a synchronous request guard and exposed the pending region with `aria-busy`.
3. `AppErrorBoundary` and React 19's default root caught-error handler could log raw render errors, including mutable message/name values. The root now installs a shared redacted reporter that logs only a constant type and component stack.
4. `AuthProvider` could commit an old account or leave a replacement grant unverified depending on BroadcastChannel delivery order. A newer replacement grant now clears prior identity immediately and is verified before session commit. Bootstrap initialization remains owned by the outstanding grant verification, preventing a transient redirect to login.
5. A late refresh from the previous account could overwrite a pending or completed account switch. Coordinator messages now distinguish `session-start` from `refresh`, bind pending grants to the expected user, and reject late different-user refreshes. Legacy messages without the discriminator clear stale identity without applying the untrusted grant.
6. The multiviewport auth E2E logout helper selected hidden/duplicate responsive menus. It now scopes the action to the active accessible navigation region; this is test-only.

## Test stability observation

- The first full run after rebasing onto `e578dbe` completed 793/794: one existing `ExamDetailPage` test queried the submit button while asynchronous attempt initialization still displayed `응시 준비 중`. The same test passed twice in isolation and the complete standalone suite then passed 794/794. No product or test change was made for this non-reproduced timing observation, and it is not hidden as a clean first-pass result.

## Explicitly not run

| Item | Status | Reason |
| --- | --- | --- |
| Real login, Google OAuth, mail delivery, credential/password change | NOTRUN | Explicitly prohibited; all flows used synthetic values and mocks. |
| Live authorization changes or security-setting changes | NOTRUN | Explicitly prohibited. |
| Permanent deletion | NOTRUN | Explicitly prohibited; no permanent-delete action was invoked. |
| Merge to `develop` or dev deployment | NOTRUN | Reserved for parent coordination and deployment approval. |
| Host-level deep security scanner | NOTRUN | The security-scan skill's host scanner/resources were unavailable in this execution environment. Read-only `npm audit` and tracked-source pattern checks were completed instead; this limitation is not represented as a deep-scan pass. |

## Verification commands

```text
VITE_API_BASE_URL=/api VITE_API_CAPABILITIES=reports,policy-consent npm run test:run
npm run typecheck
npm run lint
npm run build:qa
npm run test:e2e:mock -- e2e/auth-multitab.spec.ts
npm audit --audit-level=low
```
