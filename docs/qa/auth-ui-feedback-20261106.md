# Signup and email confirmation UI feedback — 2026-11-06

Implements the November 6 development-channel feedback about signup policy readability and a login-only action after email confirmation.

- Policy documents appear as cards with a bounded, scrollable full-text viewer. Required consent remains explicit and initially unchecked; document text, versions, draft classification and requiresConsent come from the existing contract.
- A successfully confirmed link displays a completion message and one login action, including when refreshing the current account fails. It does not sign in or mark a different current account verified.
- An already verified current account also gets the completion view. Pending/unknown states, disabled readiness, replacement invalid links, explicit confirmation, cancellation and resend throttling retain their existing behavior.

Validation on Node 22:

- ESLint and TypeScript checks passed.
- Unit suite: 111 files, 1,194 tests passed.
- UI browser suite: 9 passed across desktop, 320px phone and tablet. Screenshots and JSON results are emitted under qa-artifacts/auth-ui and uploaded by CI.
- Existing launch authentication browser suite, readiness enabled: 18 passed, 2 skipped; readiness disabled: 8 passed, 12 skipped.
- Screenshots visually inspected for phone policy cards and desktop completion. Fixtures use synthetic data and mocked APIs; no real accounts or emails were exercised.

No deployment configuration, policy approval, production data or backend behavior changes are included.

## Isolated production candidate

The main candidate is based on dd218f703a48de70d80beec012aa6c168568e97b and ports only this UI change. It does not promote the accumulated develop changes or add guardian/composer capabilities. Existing dev/prod deployment workflows are byte-for-byte unchanged.

Main-specific local validation: lint/typecheck passed; 83 unit files / 632 tests passed; UI browser suite 9 passed; existing launch authentication enabled 18 passed / 2 skipped and disabled 8 passed / 12 skipped. These counts differ from the develop baseline above.
