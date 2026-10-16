# USF Service Introduction

- Public route: `/intro` (no login required).
- Audience: visitors to the 2026 USF popup and exhibition booth, primarily on phones and tablets.
- CTA: `/classrooms`, using the existing authentication and return-route flow.
- The introduction does not replace the existing service home route.
- Content is adapted from the two user-supplied University of Ulsan / AutoAI PDFs. Future LMS integration and unverified outcome statistics are not presented as shipped features.

## Image Sources

Source: `[울산대학교] AutoAI_김종훈.pdf`, submitted for the 2026 AI/SW competition.

- `public/intro/learning.webp`: embedded service screenshot, page 9.
- `public/intro/quiz.webp`: embedded OX quiz screenshot, page 10.
- `public/intro/feedback.webp`: embedded misconception correction screenshot, page 10.

Images retain the source screenshot contents and are compressed as WebP for mobile delivery. The original PDF is not embedded because its presentation layout requires zooming to read on phones.

Additional content source: `[울산대학교] 우수작품관_김종훈.pdf`, pages 1-2 (learning flow, audience benefits, and team credits).

## Preview

Run the existing Vite development server and open `/intro`. The same URL can be opened from a phone on the same network using the server computer's LAN IP and port.

`npm run build` also generates `dist/intro/index.html` from the built SPA entry. The deployed URL is `/intro/` (Nginx redirects `/intro` to this directory), so direct visits and reloads work with the existing restricted SPA allowlist. Unknown paths still return 404. Deployment smoke tests verify the introduction entry and its three images.
