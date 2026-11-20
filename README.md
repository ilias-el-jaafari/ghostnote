# GhostNote

A modern web revival of [UltraStar](https://usdx.eu/) karaoke, built as a [Kiroween 2026](https://kiroween.devpost.com/) entry in the **Resurrection** category.

GhostNote reads UltraStar `.txt` songs, plays a backing track, listens to the microphone in the browser, and scores the singer in real time. It is meant for a party with friends and works as well on a phone as on a laptop.

**Live demo:** [https://ilias-el-jaafari.github.io/ghostnote/](https://ilias-el-jaafari.github.io/ghostnote/)

The site is served over HTTPS (required for the microphone on a phone). Chrome and Safari still need a user tap before the mic can start.

The product name lives in a single constant, `APP_NAME` in `src/config/brand.ts`. The UI is English and Spanish (language selector, remembered in `localStorage`).

## Built with Kiro

This repository is a Kiro-spec-driven project. The official Kiro artifacts live at the repo root, not nested:

- [`.kiro/steering/`](.kiro/steering/) — always-on product, stack, structure, and visual-style guidance
- [`.kiro/specs/resurrection-karaoke/`](.kiro/specs/resurrection-karaoke/) — EARS requirements, design, and the phased task list
- [`.kiro/hooks/`](.kiro/hooks/) — agent hooks (lint and tests on save)

The visual look — four switchable 2000s themes (Kaleido, Aqua Bubble, Neon Galaxy, Laser Grid) — is specified in [`.kiro/steering/visual-style.md`](.kiro/steering/visual-style.md).

## Features

- Parses official UltraStar Deluxe charts (v1 / unversioned and v2 timing, duets, goldens, rap, freestyle)
- In-browser YIN pitch detection and USDX-inspired scoring (10,000 points, classic UltraStar grades)
- Song library with three original, copyright-free demo songs and synthesized backing tracks
- Load your own `.txt` chart plus audio (multi-file or folder picker; works on mobile)
- Live note highway, AnalyserNode spectrum HUD, and a guide melody (on by default, can be muted)
- Four switchable 2000s visual themes, plus a “random each song” option (remembered in `localStorage`)
- YouTube as a backing-track source (official IFrame Player, no downloading): paste a URL or auto-detect `#VIDEO:v=` / `a=` (USDB-style). A Winamp-like mini player keeps the video visible at 200×200 CSS pixels.
- English / Spanish UI

Party/phones-as-mics mode and the optional ghost verdict are planned, not shipped yet. See [`.kiro/specs/resurrection-karaoke/tasks.md`](.kiro/specs/resurrection-karaoke/tasks.md).

## How to run locally

```bash
npm install
npm test
npm run dev
```

Then open the URL Vite prints. With the GitHub Pages base path, the dev server lives at `http://localhost:5173/ghostnote/`.

On a phone, use this machine's local IP over HTTP only if the browser allows microphone access; otherwise use HTTPS or a tunnel.

Useful query flags:

- `?sim=1` — development-only simulated singer
- `&t=6000` — seek to 6000 ms (song time)
- `&screen=results` — jump to a perfect simulated result
- `&visual=high|medium|low|static` — force the visual quality tier
- `&intro=0` — skip the wake-up intro
- `&theme=kaleido|aqua|galaxy|laser|random` — lock the visual theme
- `&yt=VIDEO_ID` — attach a YouTube video to the current song
- `&ytmock=1` — show the mini player with a local mock (for screenshots / tests)

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Run the Vitest unit tests once |
| `npm run lint` | Oxlint |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build |

Regenerate the bundled demo audio with `node scripts/render-demo-audio.mjs` (requires ffmpeg).

## Demo songs

`public/songs/` ships three original, copyright-free charts and synthesized `.ogg` backing tracks. See [`public/songs/ATTRIBUTION.md`](public/songs/ATTRIBUTION.md). They are not based on any existing song.

You can also load your own UltraStar `.txt` files plus audio. If audio is missing, lyrics stay visible and you can still sing with the guide melody. Do not add copyrighted commercial recordings to this repository.

## How the format is read

The parser follows the [UltraStar Deluxe file format](https://github.com/UltraStar-Deluxe/format):

- Required headers: `#TITLE`, `#ARTIST`, `#BPM`. `#GAP` and `#MP3`/`#AUDIO` are supported.
- Notes: `:` regular, `*` golden, `R` rap, `G` golden rap, `F` freestyle.
- `- 20` (or legacy `- 20 24`) starts a new lyric line. `E` ends the file.
- Duets: `P1` / `P2` (optional space) and `#P1` / `#DUETSINGERP1` names.
- Unversioned and v1 files use the historical BPM quadrupling when converting beats to milliseconds. v2 files use `#BPM` as-is.

Pitch is estimated with the YIN algorithm on a time-domain buffer from a Web Audio `AnalyserNode`. Comparison helpers can match a sung note to a charted note regardless of octave.

## Project layout

```
.kiro/          Steering (including visual-style.md), the product spec, and hooks
src/config/     Brand name constant and public-asset path helper
src/i18n/       English and Spanish UI copy
src/parser/     UltraStar parser and tests
src/pitch/      YIN detector, note math, microphone hook
src/game/       Timing, scoring, simulated singer
src/audio/      Guide melody and backing-track playback
src/visual/     Quality tiers, MilkDrop shader, particles
src/library/    Demo catalog and chart/audio file pairing
src/ui/         Library, sing, and results screens
public/songs/   Demo charts and original .ogg audio
```

## License and contest

This project is released under the [MIT License](LICENSE).

Code in this repository is for Ilias El Jaafari El Idrissi's Kiroween 2026 submission. The demo lyrics and audio are original and may be reused with the project. Deadline: **4 December 2026, 23:00 Europe/Madrid**.
