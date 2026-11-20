---
inclusion: always
---

# Technology Stack

## Application

- React 19 + TypeScript, bundled with Vite.
- Plain CSS (no CSS-in-JS runtime, no component library required for Phase 1).
- Client-only. There is no backend in Phase 1–3. Any later party-sync or avatar generation must be isolated and optional.

## Domain logic

- UltraStar parser: pure TypeScript in `src/parser`. Follow the official UltraStar Deluxe format (v1 / unversioned, plus v2 BPM timing). Accept comma or period decimals, CRLF, a BOM, duet `P1`/`P2` lines, and phrase breaks. Recoverable problems become warnings; missing required headers or broken note lines throw `UltraStarParseError`.
- Pitch detection: YIN on a time-domain buffer (`src/pitch/yin.ts`). In the browser, feed it samples from an `AnalyserNode` (`getFloatTimeDomainData`). Do not rely on FFT peak-picking for the sung pitch.
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

- A backend, accounts, or a real-time network layer (unless Phase 4 clearly needs it).
- New heavy UI frameworks, state libraries, or audio DSP packages, unless a gap in the current stack is blocking.
- Official or copyrighted commercial songs in the repo.
- Imitations of real artists' likeness, voice, or speaking style.

## Scripts

- `npm run dev` — local dev server
- `npm test` — Vitest once
- `npm run lint` — Oxlint
- `npm run build` — typecheck and production bundle
- `npm run preview` — serve the production bundle
