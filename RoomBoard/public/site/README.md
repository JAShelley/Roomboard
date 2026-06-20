# RoomBoard — Website Redesign

A standalone, redesigned marketing site for RoomBoard. This folder is **self-contained**
and does **not** modify the original app in `../public/roomboard/`.

## Files
- `index.html` — the landing page (hero, features, capture flow, devices, customization, downloads, FAQ, CTA).
- `styles.css` — a fresh design system: a bright "clinic teal" identity with full light/dark mode.
- `script.js` — theme toggle (persisted), mobile menu, scroll-reveal, FAQ accordion, settings-tab demo, and a live board demo with ticking timers.

## Design notes
- Intentionally distinct identity from the production app (which uses a deep-navy theme),
  while reusing the real clinic logo and doctor badges.
- Every RoomBoard feature is represented: live board, real-time sync, quick add, visit &
  cleaning timers, readiness flags, appointment types/colors, quick notes, staff badges,
  views/full-screen, appointment capture (native helpers + OCR + browser extension), and
  all devices (Mac, Windows, Web, iOS, Apple Watch).

## Assets & links
- Logo and badge images are referenced from `../public/roomboard/*.png` with emoji
  fallbacks (`onerror`), so the page still looks right if those assets move.
- Download buttons point at the GitHub Releases URLs from `../public/roomboard/config.js`.
- "Sign in" / "Open the board" link to the existing app at
  `../public/roomboard/index.html` (works when served from the project root).

## Run it
Open `index.html` directly, or serve the project root and visit `/website-redesign/`.
