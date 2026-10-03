# Release-required FE canonical evidence correction

- Date: 2026-10-03 (UTC)
- Validation baseline: `develop` at `8a9930f2d1982028bdca047ec1a600681ea518fd`
- Evidence sources: merged PRs #204, #206, and #207 plus the existing synthetic unit/component suites on that baseline
- Safety: all exercised API, SSE, upload, note, AI, and identity flows used synthetic mocks. No real student data, file, note, AI provider, persistent deletion, security-setting change, or production deployment was used.

## Status semantics

- `PASS-SCENARIO`: only the named FE scenario passed. It is not a pass for every condition in the canonical requirement.
- `NOTRUN-REQUIREMENT`: the full canonical requirement was not established. Backend, worker, content-quality, authorization, or live-service evidence may be required.
- `NOTRUN`: a specifically named scenario was not exercised.

The canonical definitions below use the acceptance-owner-confirmed mapping. Supporting FE scenarios are intentionally separated from the canonical result.

## Corrected acceptance matrix

| Canonical ID | Confirmed canonical subject | Canonical result | Verified FE scenario evidence | Explicit limits |
| --- | --- | --- | --- | --- |
| MAT-01 | Material/file access control | NOTRUN-REQUIREMENT | Existing route and owner/scope isolation tests provide general client-side isolation support. | No cross-user file URL, object-store authorization, signed-link, or backend material ACL was exercised. |
| MAT-02 | Safe upload: 45MB, 300 pages, 255-character title, empty/damaged file | PASS-SCENARIO | Empty files and non-PDF MIME are rejected before a request; exact 45MB is accepted while larger files are rejected; trimmed titles are limited to 255 characters. Evidence: `materialUploadValidation.test.ts`, `MaterialsPage.test.tsx`. | The 300-page rule and actual damaged-PDF ingestion/parser rejection were not exercised. Those portions are NOTRUN. |
| MAT-03 | Asynchronous work/reprocessing: worker, timeout, saturation | NOTRUN-REQUIREMENT | The FE renders PROCESSING/FAILED/READY states, polls visible processing rows, retains them over a transient poll error, retries, and stops after READY. Evidence: `MaterialsPage.test.tsx`, `MaterialsPagination.test.tsx`, `materialFailure.test.ts`. | No worker execution, queue saturation, processing timeout, or backend reprocessing contract was exercised. |
| MAT-04 | Text/page grounding quality | NOTRUN-REQUIREMENT | PDF parsing/request failure surfaces retry UI; learning page context, current-page movement, and completed synthetic answers are covered by component tests and `release-learning-acceptance.spec.ts`. | These checks do not measure extracted-text correctness, page citation accuracy, OCR quality, or AI grounding quality. |
| MAT-05 | Complete material-library exploration | PASS-SCENARIO | Empty state plus 1/20/21/100 record boundaries, later-page navigation, next-page failure/retry, duplicate-click suppression, visible-page polling, and count guards pass. Evidence: `MaterialsPagination.test.tsx`, `materialsRepository.test.ts`. | Synthetic FE pagination only; backend completeness and production-scale ordering are not claimed. |
| MAT-07 | Delete/cancel consistency | PASS-SCENARIO | Pending upload abort ignores late completion; deletes are single-flight; stale reads cannot restore deleted rows; last-page deletion, reload failure recovery, backfill, and double-decrement guards pass. Evidence: `MaterialsPage.test.tsx`, `MaterialsPagination.test.tsx`. | Durable server-side upload cancellation and real storage deletion were not exercised. Browser History Back during an upload is NOTRUN. |
| NOTE-01 | Delegated migration/failed-item recovery scenarios | PASS-SCENARIO | Partial import removes successful items and retains failed items; total import failure retains local items for a later retry; client IDs remain stable. Evidence: `manualNotesStore.test.ts`. | This records the delegated FE scenarios only; unknown backend migration semantics are not inferred. |
| NOTE-02 | Delegated AI-preview/save consistency scenarios | PASS-SCENARIO | Preview cancellation creates no note; repeated save produces one POST; late completion after cancellation/session change is ignored; server success plus cache quota failure returns success and performs one POST. Evidence: `ChatPanel.test.tsx`, `manualNotesStore.test.ts`. | An already-started server save has no cancellation contract; only late UI application is suppressed. |
| NOTE-04 | Delegated review collection recovery scenarios | PASS-SCENARIO | More than 20 sessions load across pages; successful quizzes survive partial failures; only failed reads retry; owner/scope changes abort or ignore old responses. Evidence: `LearnerReviewQuizzesPage.test.tsx`. | Synthetic collection behavior only; unknown canonical backend retention rules are not inferred. |
| REPORT-01 | Report scope/student isolation | PASS-SCENARIO | Classroom/owner changes clear prior results; B-scope 403 cannot revive A data; late prior-scope list or generation completion is ignored. Evidence: `InstructorReportsPage.test.tsx`. | FE isolation with mocked authorization responses; backend report ACL enforcement remains NOTRUN. |
| REPORT-02 | Numeric evidence and withheld judgment | PASS-SCENARIO | Null scores remain null rather than zero; INSUFFICIENT_DATA is presented as withheld judgment; public evidence labels and metric values are rendered. Evidence: `reportsRepository.test.ts`, `App.test.tsx`. | Not every zero/denominator combination is directly asserted for the report detail contract; canonical numeric correctness against real source data remains NOTRUN. |
| REPORT-03 | Version preservation, review, and retention of the prior confirmed version on failure | NOTRUN-REQUIREMENT | Supporting FE scenarios map completed versions and an active generation, keep one 210-second polling lifetime, retry the same job after a transient 500, perform no extra generation POST, and navigate once on completion. Evidence: `reportsRepository.test.ts`, `InstructorReportsPage.test.tsx`. | Polling/retry does not establish review workflow or preservation of the previous confirmed version after generation/review failure. |
| REPORT-05 | Source-evidence viewing and authorization | NOTRUN-REQUIREMENT | A report can render a public evidence label and metric list while hiding internal `sourceType` codes. Evidence: `App.test.tsx`, `reportsRepository.test.ts`. | Evidence-link navigation and evidence-specific authorization were not exercised. |
| ANALYTICS-02 | Delegated zero/null/insufficient-data/denominator display scenarios | PASS-SCENARIO | Learning analytics preserve zero progress, unviewed material state, unsubmitted/null quiz state, and render an assessed score with its maximum-score denominator. Evidence: `classroomsRepository.test.ts`, `InstructorPages.test.tsx`. | This is synthetic FE display evidence, not validation of backend aggregate calculations. |

## Browser versus unit/component evidence

- Chromium synthetic mock: auth isolation 3/3, volatile chat draft/navigation 4/4, and learning SSE/navigation 1/1.
- Material upload, pagination, deletion, note migration/save, review collection, and report contracts above are unit/component evidence unless explicitly named otherwise.
- Actual Chromium damaged-PDF ingestion, browser Back during upload, real report evidence-link authorization, and backend worker/queue behavior remain NOTRUN.

## Verification and disposition

- PR #206 final local suite: lint/typecheck/build PASS; 93 files / 817 tests PASS; Chromium auth 3/3 PASS.
- PR #207 final local suite: lint/typecheck/build PASS; 93 files / 828 tests PASS; focused 68/68 PASS; Chromium draft 4/4 PASS.
- PR #204 final local suite: lint/typecheck/build PASS; 94 files / 837 tests PASS; Chromium learning 1/1 PASS.
- PR #204 post-merge CI run `37101567980` and dev deployment run `37101567949` passed; smoke observed `/assets/index-DUtGp9AP.js`.
- Existing broad mock-smoke contrast/touch-target findings remain a separate baseline and are not represented as passing here.
