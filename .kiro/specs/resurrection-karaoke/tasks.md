# Implementation Plan

Tasks are grouped by phase. Do not start the next phase until the current phase builds, its tests pass, and the UI can be demonstrated.

## Phase 1 — Foundation: app shell, parser, and pitch

- [x] 1. Scaffold the Vite + React + TypeScript app, Oxlint, Vitest, and a local git repository (no remote)
  - Add `npm test` / `npm run lint` scripts and a strict TypeScript config
  - _Requirements: 9.1, 9.2_

- [x] 2. Add Kiro steering, the Resurrection Karaoke spec, and agent hooks at `/.kiro`
  - Steering: `product.md`, `tech.md`, `structure.md`
  - Spec: `requirements.md` (EARS), `design.md`, `tasks.md` split into phases 1–5
  - Hooks: run tests on save, lint TypeScript on save
  - _Requirements: 9.2_

- [x] 3. Implement the UltraStar `.txt` parser with unit tests
  - Headers `#TITLE`, `#ARTIST`, `#BPM`, `#GAP`, `#MP3`/`#AUDIO`, version, duet names
  - Notes `: * F R G`, phrase breaks `-`, end `E`, duets `P1`/`P2`
  - Malformed input, comma decimals, BOM/CRLF, beat-to-milliseconds (v1 vs v2)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 9.1_

- [x] 4. Implement YIN pitch detection and note-math helpers with unit tests
  - Synthesized sines at known frequencies
  - Frequency ↔ MIDI ↔ note name, UltraStar pitch 0 = C4
  - Octave-tolerant comparison helpers
  - _Requirements: 2.2, 2.3, 2.4, 9.1_

- [x] 5. Build the Phase 1 page: load a demo song, show lyrics, and offer a mic test
  - Original copyright-free `Midnight Echo` demo chart
  - File picker / drop zone for a user UltraStar file
  - Live note, cents needle, level meter, mobile permission copy
  - Responsive layout, PWA manifest, touch-friendly controls
  - _Requirements: 2.1, 2.5, 2.6, 4.1, 4.2, 4.3, 6.1, 6.3, 6.4_

## Phase 2 — Gameplay and scoring screen

- [x] 6. Build the song timing engine (beats ↔ ms from `#BPM` / `#GAP`, v1 vs v2) with unit tests
  - Timeline helpers for current / next line and active notes
  - _Requirements: 3.1, 1.6_

- [x] 7. Implement scoring math as pure, tested functions
  - 9000 note points + 1000 line bonus = 10000; golden 2×; freestyle 0; rap by presence
  - Octave-tolerant 50-cent window; 50% coverage to count a beat
  - _Requirements: 3.2, 3.3, 3.4, 3.7, 2.4, 10.1_

- [x] 8. Build the sing screen and results screen
  - Scrolling pitch-lane note highway, live pitch marker, current + next lyric, pause/restart
  - Synthesized guide melody or silent clock until real audio exists
  - Dev-only simulated singer (`?sim=1`) and a headless integration playthrough test
  - English / Spanish UI with a language selector
  - _Requirements: 3.1, 3.5, 3.6, 3.8, 3.9, 4.1, 4.4, 9.1, 9.2, 9.3_

## Phase 3 — Frutiger Aero theme, library, and deploy

Follow `.kiro/steering/visual-style.md`. Do not ship a flat or minimalist look.

- [x] 9. Apply the Frutiger Aero / Aqua Gloss + 2000s rhythm-HUD theme
  - GLSL / WebGL MilkDrop-style background (soft fractals, translucent moving geometry)
  - Glossy 3D capsule bars and buttons: top-45% white reflection, bevel, inset box-shadow
  - Additive particles and lens flares (`lighter` / AdditiveBlending)
  - AnalyserNode waveforms; rgba HUD plates with a thin bright top border
  - Classic sans-serif with a hard black outline; subtle ghostly-green notes, gold for goldens
  - Performance fallbacks: reduced shader quality on low-end phones, `prefers-reduced-motion`, CSS Aero fallback without WebGL
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 10. Song library with demo audio and custom-file loading
  - Ship original, copyright-free demo audio next to the charts
  - Let the user load their own `.txt` plus audio
  - Explain missing audio without blocking lyrics
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 11. Deploy a public static build and confirm the live URL
  - Ask Ilias which host to use before publishing
  - _Requirements: 4.3, 10.3_

## Phase 4 — Party features (including phones as mics)

- [ ] 12. Add a song queue and take-turns flow so the next singer can start without a reload
  - _Requirements: 7.1_

- [ ] 13. Score duet voices separately when a chart has `P1`/`P2`
  - _Requirements: 1.3, 7.2_

- [ ] 14. Show a party scoreboard that is readable from a short distance
  - _Requirements: 7.3, 4.1_

- [ ] 15. Phones-as-microphones with a TV/laptop host screen
  - Host shows a room code and QR; phones join, detect pitch locally, and send pitch/score data in real time
  - Transport: WebSocket or WebRTC plus a small relay; do not upload raw mic audio
  - Local one-device play still works if no phone joins
  - _Requirements: 7.4, 7.5, 7.6_

## Phase 5 — Optional decorative ghost verdict

- [ ] 16. Design fictional era-inspired ghost personas that do not imitate real artists
  - _Requirements: 8.1, 8.2_

- [ ] 17. Show a short written verdict on the end screen based on the score
  - Must be skippable; scoring works if this is off
  - _Requirements: 8.1, 8.4_

- [ ] 18. (Optional) Generate a fictional ghost avatar only if time remains and the written verdict already works
  - Degrade gracefully when generation is unavailable
  - _Requirements: 8.3, 8.4_

## Contest wrap-up (after the playable app)

- [ ] 19. Record a demo video under 3 minutes and write the Devpost submission
  - Public GitHub repo with `/.kiro` at the root, after Ilias confirms the repo name
  - Deadline: 4 December 2026, 23:00 Europe/Madrid
  - _Requirements: 10.2, 10.3, 10.4_
