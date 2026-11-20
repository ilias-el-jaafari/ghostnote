# WakeStar

A modern web revival of [UltraStar](https://usdx.eu/) karaoke, built as a Kiroween 2026 entry in the **Resurrection** category.

WakeStar reads UltraStar `.txt` songs, listens to the microphone in the browser, and (from Phase 2) scores the singer in real time. It is meant for a party with friends and is designed to work as well on a phone as on a laptop.

**Phase 1 is implemented:** parse a song, show the lyrics, and test the mic. Gameplay, the full visual theme, party features, and the optional ghost verdict come later. See `.kiro/specs/resurrection-karaoke/tasks.md`.

## Try it locally

```bash
npm install
npm test
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). On a phone, use the same machine's local IP over HTTP only if the browser allows microphone access; otherwise use HTTPS or a tunnel. Chrome and Safari require a user tap before the microphone can start.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Run the Vitest unit tests once |
| `npm run lint` | Oxlint |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build |

## Demo song

`public/songs/midnight-echo.txt` is an original, copyright-free chart written for this project. It is not based on any existing song. Audio for the demo will be added in Phase 3; Phase 1 only needs the text.

You can also load your own UltraStar `.txt` files from the page. Do not add copyrighted commercial recordings to this repository.

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
.kiro/          Steering, the product spec, and agent hooks (required for Kiroween)
src/parser/     UltraStar parser and tests
src/pitch/      YIN detector, note math, microphone hook
src/ui/         Song panel and mic-test widget
public/songs/   Demo charts
```

## License and contest

Code in this repository is for Ilias El Jaafari El Idrissi's Kiroween 2026 submission. The demo lyrics are original and may be reused with the project. This repository has no remote yet; it will be published as a public GitHub repo before the deadline of **4 December 2026, 23:00 Europe/Madrid**.
