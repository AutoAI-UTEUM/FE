# Overnight service QA

This suite performs the one-off service verification requested for the 2026-09-20
10:00 KST hard deadline. It does not change product code, merge pull requests, or deploy.

## Coverage

- `mock`: full desktop, phone, tablet portrait/landscape, Firefox, and WebKit matrix
- `dev`: live public health plus authenticated role navigation and a personal schedule
  create/update/delete round trip when dedicated QA credentials are configured
- `prod`: public health, primary-host metadata, static crawler files, and authenticated
  read-only navigation when dedicated QA credentials are configured
- lint, typecheck, unit tests, and production build
- cold/warm page timings, Core Web Vitals, duplicate requests, long tasks, heap growth,
  lazy loading, and production bundle budgets
- console errors, failed requests, HTTP 5xx, blank/error pages, page-level horizontal
  overflow, WCAG A/AA serious violations, and 44px touch targets

Production API mutations are blocked in the browser before they can leave the page.
Only login, refresh, and logout are permitted authentication writes.

## Required secrets

Configure dedicated accounts with the following repository secrets. Missing roles are
reported and skipped rather than replaced with personal accounts.

```text
DEV_QA_LEARNER_EMAIL / DEV_QA_LEARNER_PASSWORD
DEV_QA_INSTRUCTOR_EMAIL / DEV_QA_INSTRUCTOR_PASSWORD
DEV_QA_ADMIN_EMAIL / DEV_QA_ADMIN_PASSWORD
PROD_QA_LEARNER_EMAIL / PROD_QA_LEARNER_PASSWORD
PROD_QA_INSTRUCTOR_EMAIL / PROD_QA_INSTRUCTOR_PASSWORD
PROD_QA_ADMIN_EMAIL / PROD_QA_ADMIN_PASSWORD
```

`QA_ISSUE_TOKEN` is an optional fine-grained GitHub token with issue write access to
both `AutoAI-UTEUM/FE` and `AutoAI-UTEUM/BE`. Without it, CI stores sanitized issue
drafts in the run artifact instead of creating issues across repositories.

## Execution

Use the manual `Overnight service QA` workflow or run locally:

```powershell
$env:QA_CREATE_ISSUES='true'
$env:QA_DEADLINE='2026-09-20T10:00:00+09:00'
npm run test:overnight
```

Evidence is written under `qa-artifacts/<environment>/`. Dev schedule data is deleted
in a `finally` block even when its update assertion fails.

## Completion policy

- Every planned QA category runs once in this execution even if an older run passed it.
- A failed command is retried once after two minutes when the 09:30 cleanup cutoff permits.
- Passing checks are not repeated merely to keep the process alive until 10:00.
- After the QA and issue pass, GitHub evidence is collected for a commercialization review.
- A connected Codex follow-up reads the GitHub evidence and accessible Notion product
  documents, then writes separate school, academy, and B2C recommendations.
- The task ends as soon as that recommendation report is complete. 10:00 KST is a hard
  deadline, not a minimum runtime.
