# FE release acceptance: learning, quiz, exam, diagnosis

- Date: 2026-10-03 (UTC)
- Independent worktree: `validate/learn-quiz-exam-qa-acceptance`
- Candidate: `55fc252` (PR #204 merged locally with `develop`)
- Develop base: `8a6c64f653c52502b56600a0d41fda90a806e518`
- Safety: synthetic local API/SSE only; no AI provider call, real exam submission, persistent product-data mutation, or real credential use
- Scope note: the repository and its local history contain no `QuizEditor` component. The current authoring surface is `ExamEditor`; `QuizEditor`-specific and unknown backend contracts are marked `NOTRUN`.

## Acceptance matrix

The repository does not contain the source ticket text for the supplied IDs. The ID grouping below follows the behaviours named in the delegated request rather than inventing missing acceptance criteria.

| ID / behaviour | Result | Evidence level | Evidence |
| --- | --- | --- | --- |
| LEARN-01: SSE closes/errors before ready | PASS | unit | `useSessionChat.test.tsx`: no POST before ready on error/EOF |
| LEARN-02: SSE ready then closes before turn start | PASS | unit | `useSessionChat.test.tsx`: `STREAM_CLOSED_BEFORE_TURN`, zero POST |
| LEARN-03: SSE closes mid-answer and omits `completed` | PASS | unit | Partial streaming message is replaced by one persisted final response; one POST |
| LEARN-04: `completed` then EOF and duplicate events | PASS | unit | Duplicate `ready` and duplicate `completed` terminal events still produce one POST and one final response |
| LEARN-06: synthetic hidden-state ordering and `TURN_IN_PROGRESS` recovery | PASS | component/unit | A stream closed after synthetic `document.visibilityState = hidden` ordering is reconciled from the posted result with one POST; conflict recovery polls without reposting. This does not claim a browser lifecycle-specific `visibilitychange` handler. |
| LEARN-08: fast page 1→2→3 and stale/cancel boundaries | PASS | Chromium + component | Chromium sends one final PATCH `{pageNumber:3}`; cancellation removes only its temporary stream, preserves an older completed response, and never reposts; stale navigation/unmount results are ignored |
| LEARN-08: browser back preserves prior response and avoids repost | PASS | Chromium | Client-side move to classrooms and Chromium back restore the prior response while turn POST remains exactly one |
| LEARN-08: browser back preserves unsent question draft | PASS | Chromium on merged base | PR #207 is included in the develop base; `e2e/chat-draft.local.spec.ts` verifies back restoration, session/owner isolation, and submit clearing with synthetic APIs. |
| QUIZ-01: progressive question stream and persisted restore | PASS | component/unit | Streamed questions retain answers; saved quiz restores without AI message or `completed` |
| QUIZ-04: learner answer/result states | PASS | component/unit | Empty answer validation, O/X fallback, duplicate-submit lock, review answer/verdict/score/explanation restoration |
| EXAM-01: current editor contract | PASS | component/unit | Empty/Unicode-only required text, meaningful Unicode, MCQ/OX/SHORT/ESSAY transitions, four MCQ options, fractional points totalling 10, cancel/reopen reset |
| EXAM-01: learner result contract | PASS | component/unit | Null vs zero scores, partial/unknown scores, omitted Unicode-only answers, unanswered display, backend-authoritative past deadline, completed submission re-entry |
| QA-02: diagnosis → correction → retest | PASS | component/unit | Failed submit retains input; direct same-tick duplicate submit/retest is guarded; retry succeeds; stale navigation results ignored |
| Supported capability DTOs with flags disabled by default | PASS | unit | `apiRepositories.test.ts`: explicit supported capability mapping only; no runtime feature activation in this validation |
| Real `QuizEditor` contract | NOTRUN | missing implementation | No component/file exists on `develop` or local `origin/feat/quiz-progressive-ui` |
| Unknown backend policies/contracts | NOTRUN | intentionally excluded | No guessed fields, server policy changes, or unsupported feature activation |

## Chromium evidence

`e2e/release-learning-acceptance.spec.ts` ran against the local Vite mock API in Chromium 1440:

- rapid page moves produced exactly one `PATCH /api/sessions/100/page` with page 3;
- the learning turn used one synthetic SSE GET and one turn POST;
- the chat gained exactly one user item and one final AI item, whose role label and complete fixture content were asserted, then unlocked the input;
- client-side navigation to classrooms and Chromium back retained the pre-existing response and did not repost;
- all non-`127.0.0.1` requests were blocked and the observed external-origin list was empty.

Final result: **1 passed**.

## Unit/component evidence

Targeted final command covered 13 files and **198 tests, all passed**. It includes session/chat, page navigation, diagnosis, quiz, exam list/detail/editor/repository, and API/SSE mapping tests.

New independent evidence:

- ready-then-EOF before POST;
- mid-answer EOF without `completed`;
- hidden-tab stream interruption followed by posted-result reconciliation after return;
- duplicate `ready` and duplicate `completed` terminal-event deduplication;
- cancellation after POST with older completed-answer preservation and no repost;
- current `ExamEditor` Unicode/type/options/points validation;
- composer cancel/reopen reset.

## Repository gates

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | no ESLint findings |
| `npm run typecheck` | PASS | `tsc -b --pretty false` |
| `npm run build` | PASS | production build completed; existing large-chunk warnings only |
| Targeted unit/component | PASS | 13 files / 198 tests |
| Targeted Chromium mock | PASS | 1 test / Chromium 1440 |
| Full `npm run test:run` (CI env) | PASS | Candidate `55fc252` on develop `8a6c64f`: 94 files passed; 837 tests passed. PR #206's auth race fixes and PR #207's material/note/draft fixes are included in the base. |
| Existing full mock smoke | FAIL (baseline/out of scope) | WCAG contrast failures (`#8a94a6` on white/light backgrounds) and a 28px touch target; not changed because they are outside the delegated feature/file scope |

## Review and disposition

- The separately reported unsent chat draft loss was fixed and evidenced by merged PR #207; this PR's develop base includes that result.
- Product implementation files were not changed.
- `InstructorExamSubmissionPage*`, `SessionDetailPage.tsx`, `QuizPage.tsx`, and `DiagnosisPage.tsx` were not modified.
- PR #204 remains test-only. The refreshed candidate is green on the merged PR #206/#207 develop base and remains parent-coordinated for merge.
