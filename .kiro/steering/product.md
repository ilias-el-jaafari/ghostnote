---
inclusion: always
---

# Product Overview

GhostNote is a modern web revival of the classic UltraStar karaoke game. It is the Kiroween 2026 entry in the Resurrection category by Ilias El Jaafari El Idrissi.

## Why it exists

UltraStar is a beloved PC karaoke game that scores you as you sing along to timed pitch notes. GhostNote brings that ritual back to life as a web app you can open on a laptop or a phone at a party, without installing a desktop client.

The "resurrection" is literal: an old format and an old way of playing, woken up as a web product. The Phase 3 visual language is specified in `.kiro/steering/visual-style.md`: Frutiger Aero / Aqua Gloss (2004–2009) plus a 2000s arcade rhythm-game HUD, with only subtle Halloween / ghostly-green touches. Flat or minimalist design is forbidden.

The display name lives in one constant, `APP_NAME` in `src/config/brand.ts`. The UI is English and Spanish, with a language selector, persisted in localStorage, defaulting from the browser language.

## Target users

- Primary: Ilias and friends at a house party, passing a phone or crowding around a laptop.
- Secondary: anyone who already has UltraStar `.txt` songs and wants to sing them in a browser.
- Contest judges watching a short demo video on Devpost.

The product must need very little setup. A first-time guest should understand how to start a song and sing into the mic in seconds.

## Key features

- Parse UltraStar `.txt` songs (headers, notes, lyric line breaks, duets).
- Detect the singer's pitch in real time from the device microphone, in the browser.
- Score the singer against the chart during playback (from Phase 2).
- A library of original, copyright-free demo songs, plus the ability to load your own UltraStar files (Phase 3).
- Party-friendly flow (Phase 4): song queue, take turns, duets, a scoreboard, and a required phones-as-microphones mode with a TV/laptop as the shared host screen (room code / QR; the phone detects pitch locally and sends pitch and score data in real time over WebSocket or WebRTC through a small relay).
- Optional end-of-song "ghost" verdict: a funny persona inspired by the song's era — never an imitation of a real artist — and, if there is time, a generated ghost avatar (Phase 5).

## Constraints and principles

- Build in short phases. Each phase has tests. Do not start the next phase until the current one works.
- Desktop and mobile are equal citizens: responsive layout, large touch targets, careful microphone permission UX.
- Stay in the browser. No native install, no account required to sing.
- Demo content must be original and copyright-free. Users may load their own UltraStar files.
- Do not imitate real artists in generated text, voices, or avatars.
- Ask Ilias before locking a decision that changes the contest deliverable or the feel of the product.
- The public GitHub repository must keep this `.kiro/` folder at the repo root, showing specs, steering, and hooks.

## Success

A friend can load a song (or pick a demo), sing a verse, and see a live score and a memorable end screen — on a phone or a computer — before the Kiroween deadline of 4 December 2026, 23:00 Europe/Madrid.
