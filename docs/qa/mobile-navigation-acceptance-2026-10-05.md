# Approved mobile navigation acceptance — 2026-10-05

Baseline: develop ef1615b2ef30db80cea44f2487208a643ba18052 (PR234). The user approved the proposed phone notification placement, More naming, role-specific three core tabs and portrait-tablet unread badge. This implements that decision while preserving the earlier popup fixes and remaining destinations.

## Resulting behavior

| Surface | Approved behavior | Preserved behavior |
| --- | --- | --- |
| Phone general pages | Bell aligned to header right; learner classroom/notes/review quizzes/More; instructor classroom/join requests/calendar/More. All three core tabs remain visible below420px. | Notifications dialog, account/settings/logout, learner calendar/exams, updates/feedback remain reachable. |
| Portrait tablet and split view | Same four bottom slots. More displays unread count capped visually at9+ when the notification list contains unread items. | Notifications stay inside More; no new header or duplicate bell/popup is introduced. |
| Tablet landscape/rail | Existing sidebar and direct settings link. | Sidebar order and existing entrance-request label stay unchanged. |
| Desktop, including narrow window | Existing navigation order, profile trigger and notifications layout. | PR234 popup bounds and lifecycle remain intact. |
| Study workspace | Existing header/sidebar, account menu and progress; no global bottom bar. | Phone study bell position, PDF/chat layout, input and classroom return stay unchanged. |

The instructor bottom label is '가입 요청' and its accessible pending badge is '가입 요청, 대기 요청 N개'. The desktop/sidebar still uses its existing '입장 요청' label and order. bottomNavOrder/bottomNavLabel affect only the bottom navigation. Sorting is applied to a filtered copy, so the primary navigation array is not mutated.

More uses an ellipsis icon; account avatar, name and role remain inside the popup, followed by available additional routes, settings and logout. Current core route is marked on its tab; calendar/exams/account routes select More. Opening a popup alone does not claim that its trigger is the current page.

## Badge meaning and accessibility

Portrait-tablet More's accessible name is '더보기 메뉴, 불러온 알림 중 미읽음 N개'; the internal notifications item states the same scope. The visual9+ badge is hidden from assistive naming to avoid duplicate or truncated counts. At0 the indicator disappears;1 and9 are numeric;10 and20 become9+. Pending join requests and unread notifications are different counts and controls.

This is the number of unread items in the currently loaded notification list. The existing repository requests page0,size20; it is not an account-wide total. Tests deliberately use20 loaded items, totalElements300,totalPages15 and mixed readAt values to prove that the metadata total is not presented as an unread count. Unread notifications outside the loaded page remain outside this change's contract.

## Verification matrix and evidence

Two synthetic roles ×19 projects ×4 scenarios =152 browser checks. Matching physical screen is set independently for split view. Chromium emulation is not physical-device verification.

| Group | Screen / viewport conditions |
| --- | --- |
| Phone | 320×740,390×844,419×844,420×844,430×932,599×900; landscape844×390, touch enabled |
| Tablet | 600×900,768×1024 portrait; physical768×1024 with viewport375×980 split;820×600 rail,1023×768,1024×768,1366×1024 landscape, touch enabled |
| Desktop | 844×800,1023×800,1024×800,1440×900 non-touch;1367×1024 touch exceeds the existing mobile long-edge threshold |

Scenarios cover actual core-tab and More-route clicks; one active bottom destination;44px minimum controls and viewport bounds;20-row notification dialog and last-row hit testing; keyboard notification/profile switching; Escape/focus/outside press/Back; rail Escape priority; available study popups; PDF canvas/input and desktop profile/progress preservation. Synthetic logout is fulfilled in-browser and clears only the isolated local session. Updates uses a local snapshot fixture so no public GitHub fallback is executed.

The suite blocks other external requests, API mutations and AI streams, and records page errors as failures. CI runs the exact PR head, attaches named screenshots to HTML/JSON and uploads navigation-browser-regressions for7days.

Local lint/typecheck/production build passed. Relevant unit52/52 and full unit1043/1043(104files) passed. Independent read-only review passed20 targeted browser checks: two roles×five boundary screen samples plus two roles×five mixed unread states. Local full matrix: 150/152 passed; two 600px study checks failed because the test used an incorrect control-group name. After correcting the selector to the existing “학습 화면 보기” group, both targeted checks passed. Exact-head CI must run the complete 152-case matrix before merge.

The first representative run exposed outdated test selectors and ambiguous synthetic name/role text, which were corrected without weakening exact trigger/popup counts. A subsequent read-only guard blocked the Updates public-API fallback; adding its local snapshot fixture preserves the synthetic-only requirement. The study selector correction uses the existing compact-view control to select 학습 before inspecting the input and 자료 before inspecting the classroom return; no study product behavior changed. These failed attempts are not counted as passing evidence.

[Earlier diagnostic coverage and limitations](navigation-acceptance-coverage-2026-10-05.md) remain the historical baseline. The product decisions above are now implemented; its remaining actual-device/integration limits still apply. Representative screenshots (synthetic Chromium rendering):

- [Learner phone: three core tabs and right-side bell](mobile-navigation-evidence-2026-10-05/phone-390-learner-approved-tabs-unread.png)
- [Instructor phone: pending join requests and calendar](mobile-navigation-evidence-2026-10-05/phone-390-instructor-approved-tabs-unread.png)
- [Portrait tablet: unread 9+ on More](mobile-navigation-evidence-2026-10-05/tablet-portrait-learner-approved-tabs-unread.png)
- [Tablet More: account and scoped unread count](mobile-navigation-evidence-2026-10-05/tablet-portrait-learner-unread-9-mixed-list.png)
- [Landscape phone: bounded and scrollable More popup](mobile-navigation-evidence-2026-10-05/phone-landscape-learner-profile-open.png)

Final CI/deployment results are linked from the PR.

## Remaining limits

Actual phones/tablets, Safari/Firefox, software keyboard/IME/safe areas, real Google login/email activation, live backend authorization/delivery/file behavior and user usability studies were not run. The existing menu ArrowDown navigation gap is retained as a separate accessibility improvement. Direct focus of the last popup control establishes scrolling/hit visibility, not a complete Tab/arrow navigation audit. No main/production deployment or canceled Notion write is included.
