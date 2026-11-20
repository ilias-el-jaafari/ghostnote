---
inclusion: always
---

# Technology Stack

## Application

- React 19 + TypeScript, bundled with Vite.
- Plain CSS plus a WebGL GLSL MilkDrop-style background and Canvas 2D additive particles, as described in `visual-style.md`. No new UI framework without asking. Low-end and `prefers-reduced-motion` fallbacks are required.
- Lightweight i18n in `src/i18n` (English and Spanish). The display name is `APP_NAME` in `src/config/brand.ts`.
- Client-only through Phase 3. Phase 4 needs a small free-tier hosted relay (WebSocket or WebRTC signalling; exact host decided later) so phones can join a host screen; keep it isolated from scoring math. Avatar generation in Phase 5 stays optional.

## Domain logic

- UltraStar parser: pure TypeScript in `src/parser`. Follow the official UltraStar Deluxe format (v1 / unversioned, plus v2 BPM timing). Accept comma or period decimals, CRLF, a BOM, duet `P1`/`P2` lines, and phrase breaks. Recoverable problems become warnings; missing required headers or broken note lines throw `UltraStarParseError`.
- Pitch detection: YIN on a time-domain buffer (`src/pitch/yin.ts`). In the browser, feed it samples from an `AnalyserNode` (`getFloatTimeDomainData`). Do not rely on FFT peak-picking for the sung pitch.
- Timing and scoring: `src/game` (beats ↔ ms, USDX-inspired 9000 note points + 1000 line bonus = 10000, golden notes 2×, freestyle 0, octave-tolerant 50-cent window). Pure functions, no DOM.
- Note math: frequency ↔ MIDI ↔ scientific note names, UltraStar pitch 0 = C4 = MIDI 60, and octave-tolerant pitch-class comparison in `src/pitch/note.ts`.

## Testing and quality

- Unit tests with Vitest (`npm test`). Prefer tests next to the module they cover (`*.test.ts`).
- Parser tests must include malformed files. Pitch tests must use synthesized sines at known frequencies, not a live microphone.
- Lint with Oxlint (`npm run lint`), the linter shipped with this Vite template.
- `strict` TypeScript, including `noUncheckedIndexedAccess`. Use `import type` for type-only imports. Do not use TypeScript enums (`erasableSyntaxOnly` is on).

## Browser APIs

- Microphone: `navigator.mediaDevices.getUserMedia` with `echoCancellation`, `noiseSuppression`, and `autoGainControl` turned off so singing is not "cleaned up" away.
- Resume `AudioContext` from a user gesture (required on iOS).
- PWA-ready: a web app manifest, theme color, and mobile web-app meta tags from Phase 1. A service worker can come later if offline play is needed; do not block gameplay on it.

## What not to add without asking

- A backend or accounts. A small real-time relay is expected in Phase 4 for phones-as-mics; do not invent a larger platform around it.
- New heavy UI frameworks, state libraries, or audio DSP packages, unless a gap in the current stack is blocking.
- Official or copyrighted commercial songs in the repo.
- Imitations of real artists' likeness, voice, or speaking style.

## Scripts

- `npm run dev` — local dev server
- `npm test` — Vitest once
- `npm run lint` — Oxlint
- `npm run build` — typecheck and production bundle
- `npm run preview` — serve the production bundle
