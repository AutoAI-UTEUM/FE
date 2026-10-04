# Navigation acceptance coverage — 2026-10-05

This is a bounded navigation audit, not a claim that all UI/UX is complete. Earlier checks covered clipping, contrast, focus and device rendering more thoroughly than information placement and actual discovery/navigation flows. Passing unit tests alone did not establish navigation suitability.

## Evidence conditions

Baseline: develop 7f63d823a7013a7793e77a961da960304eaddc3a (PR #233). The original audit rendered 89 Chromium screenshots with synthetic learner/instructor accounts and local mock APIs. The [baseline manifest](navigation-evidence-2026-10-05/baseline-manifest.json) records all filenames and SHA-256 hashes; six representative baseline images are retained here. Remaining original captures are local audit evidence, not uploaded by CI.

Baseline viewport/screen pairs: phone 390×844, 430×932, 844×390; tablet 768×1024, 1024×768; desktop 1440×900. Touch is enabled for phones/tablets. Follow-up automated coverage adds touch tablet rail 820×600 and non-touch desktop 844×800. Matching physical screen and viewport is essential because responsive mode uses more than CSS viewport width. These are browser emulations, not actual devices.

No real account login, production data mutation or AI calls were used. The navigation suite blocks non-local requests, API mutations other than synthetic login/refresh, and AI stream requests. Notification read/delete buttons are focused but never activated. Mock unread notification fixtures cover zero, one (original audit) and twenty (regression) items.

Repository checkout/AGENTS/.agents/skills guidance was searched in the target tree and known project/parent locations; no such instruction files were found. README and existing QA/deployment guidance were read. The separate original checkout and its user state were preserved.

## Existing behavior and reproduced defects

| Finding | Evidence / actual purpose | Minimal change |
| --- | --- | --- |
| Phone header and bottom profile duplicate | Both open the same account/overflow menu; neither is a separate My Page. 390 portrait had two profile triggers and two menu instances. CSS mobile-web:!block defeated !hidden. [Before](navigation-evidence-2026-10-05/before-phone-portrait-learner-profile.png) | Render only the active entry. Preserve bottom profile on the intended phone/portrait-tablet layouts; preserve desktop profile and study progress from PR233. |
| Phone notification panel leaves viewport | 390 portrait panel x=-191.59,width=320; right=128.41, so approximately 60% is clipped. Reproduced empty and unread states in both roles. [Before](navigation-evidence-2026-10-05/before-phone-portrait-learner-unread-panel.png) | Bound the popup to visible viewport with internal scrolling; keep the bell in its current place. Same defect reproduced in narrow non-touch desktop x=-207.6; apply the bound below 1024px there too. |
| Landscape account menu starts above viewport | Learner 844×390 bottom popup y=-36,height=354. [Before](navigation-evidence-2026-10-05/before-phone-landscape-learner-profile.png) | Cap menu height and allow scrolling, including access to last item. |
| Browser Back leaves popup open | Open profile → Settings → reopen → Back retained open menu state (two visible menus at baseline). | Close profile/notifications on popstate. Escape closes and restores trigger focus; outside press continues to close. |
| Keyboard switching keeps two popups | Independent review: desktop bell → focus profile → Enter leaves dialog=1 and menu=1. Pointer outside handling alone misses this path. | All profile triggers explicitly close notifications. |
| Tablet rail Escape closes wrong surface | Independent review: touch820×600, expanded drawer → bell → Escape left notification open and closed drawer. Capturing focus-scope handler stopped the bubble handler. | First Escape closes notification and restores bell focus, preserving drawer; second Escape closes drawer and restores expand-button focus. |

Tablet landscape's avatar/name is an actual /settings link, not the account popup. Normal desktop has one account-menu trigger. The hidden portrait-tablet sidebar is prevented from rendering a second notification panel. Desktop profile and progress remain visible in study; [baseline study evidence](navigation-evidence-2026-10-05/before-desktop-learner-study-profile.png).

## Coverage reconciliation

| Area / earlier evidence | Missing coverage that explains the miss | This audit / regression evidence | Remaining limit |
| --- | --- | --- | --- |
| Post-login role navigation: service-qa role routes and health checks | Direct page.goto bypassed global menu discovery and actual navigation. Page health checks do not open popups. | Both roles, baseline six viewports: link destinations, bottom/overflow contents, classroom/detail rendering. New eight-project suite checks actual settings menu/link navigation. | A navigation path existing does not establish that its label/priority is discoverable. No user usability study. |
| Account menu: App.test account content/settings assertions | getAllByRole(...)[0] accepted duplicate triggers. jsdom cannot establish CSS display cascade, viewport bounds or hit testing. | Exact raw DOM counts, active entry, actual Enter open, first-item focus, Escape return, outside press, Back, menu scroll. | ArrowDown menu navigation is an existing accessibility gap. Full Tab/arrow sequence is not certified by direct .focus() of last item. |
| Notification content/read/delete unit assertions | No pixel bounds, popup switching, drawer Escape or study-popup combinations. | Eight screen conditions × two roles, 20-row read-only fixture: single dialog, bounds, last-control visibility/hit test, keyboard switch, Escape/focus, outside press, Back. Available study bells are opened too. | Real notification delivery and backend actions are not executed. Portrait tablet has no closed-profile unread badge. |
| Classroom/material acceptance MAT-02/05/07 and canonical evidence | Scenario-specific unit/component outcomes cannot certify real files, worker behavior, all permissions or upload navigation. | Both roles: classroom detail renders; fixture PDF canvas and study return route render/click. | Live file authorization/ACL, 300-page/large PDF, damaged PDF, real worker network, Back during upload remain NOT RUN here. See existing canonical evidence's bounded claims. |
| Study SSE/Back and UI-04/05 accessibility evidence | Desktop SSE/back checked conversation state; scoped AI-panel scan missed global menu lifecycle. Earlier viewport-only landscape emulation did not prove phone responsive mode. | No global bottom bar in study; input inside viewport; available profile/bell popup bounds and Escape; desktop profile/progress preserved; fixture classroom return clicked. Baseline phone landscape log70px,last actions reachable after scroll; tablet-landscape scroll also checked. | Software keyboard/IME, physical device safe areas, real PDF content under floating Next, long conversation behavior beyond fixture are not certified. |
| Account/auth scenario evidence | Navigation rendering does not prove external auth integrations. | Settings route reached through menu or tablet link; existing auth CI kept as separate gate with exact-head checkout. | Actual Google login, email activation, real account lifecycle and BE fixture-dependent assertions remain NOT RUN. |

## Product decisions retained for review

- At 390px learner bottom tabs are classroom/notes/profile; review quiz, exams and calendar are under profile. Instructor has classroom/calendar/profile; join requests (fixture count2) are under profile. At >=420px a third navigation priority appears. Whether profile should be called More, and role-specific tab priorities, needs a product decision.
- Portrait tablet notifications are only discoverable inside profile and there is no closed-profile unread badge. [Closed](navigation-evidence-2026-10-05/before-tablet-portrait-learner-unread-home.png), [open](navigation-evidence-2026-10-05/before-tablet-portrait-learner-unread-profile.png). Decide whether a visible notification entry/badge is required.
- Study label '주차 페이지로' returns to remembered classroom if one was visited; fresh direct entry returns /classrooms. Both branches were observed. Wrong-classroom return across multiple classrooms was not verified. Clarify whether context must be derived from the session rather than navigation history.
- Phone landscape gives the chat log only70px in the observed fixture. Actions were reachable, so a fixed-menu overlap was not established; readability and tab label wrapping still need design review.
- Normal desktop navigation restored by PR233 is retained. Hiding it again is not a remedy.

These decisions are not silently implemented by the popup defect patch.

## Verification record

Local lint, typecheck and production build passed (existing chunk-size warnings remain). Independent read-only review passed 10/10 targeted browser interactions across both roles and five conditions after the two extra defects were fixed.

The suite is e2e/navigation-popup-regressions.spec.ts with playwright.navigation.config.ts: three scenarios × two roles × eight projects =48 checks. It attaches classrooms, account/notification popups, notification scroll, classroom detail and study screenshots to the HTML/JSON report. CI publishes the navigation-browser-regressions artifact for7days. Download and open html/index.html to inspect each named screenshot and assertion. All Frontend CI jobs explicitly check out the candidate PR head SHA; CI results and deployment outcome are recorded in the PR.

Local full unit and final48-browser results: 1043/1043 unit tests in104 files and48/48 browser checks PASS. Browser screenshot attachments: 116.

A prior unit run omitted CI's API environment values and failed93 fixture-dependent tests; this is invalid configuration evidence, not93 product defects. An earlier correctly configured full run found one submission-readiness race in an existing ExamDetailPage test. The test now waits for the enabled Submit button while preserving Unicode-answer/request-ID assertions; no exam product behavior changed. An earlier browser run had one PDF load failure while a second build was writing dist; interference was suspected, not proven; the final browser run is performed without another dist writer. Failed attempts are not counted as passing evidence.

No whole-app/whole-device UX completion claim follows from these checks. Actual devices, Safari/Firefox, software keyboard and real Google/email/BE-dependent behavior remain unverified.

Representative final screenshots: [phone single profile](navigation-evidence-2026-10-05/after-phone-390-profile-open.png), [phone notification bounds](navigation-evidence-2026-10-05/after-phone-390-notifications-open.png), [landscape scroll menu](navigation-evidence-2026-10-05/after-phone-landscape-profile-open.png), [desktop study profile/progress](navigation-evidence-2026-10-05/after-desktop-study-profile.png).
