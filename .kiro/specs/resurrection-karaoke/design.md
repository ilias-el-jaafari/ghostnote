# Design Document

## Overview

WakeStar is a client-only React application. Song parsing and pitch detection are pure TypeScript modules with no DOM dependency, so they can be unit-tested with fixture text and synthesized sines. The UI is a thin layer that loads files, requests the microphone, and (from Phase 2) synchronizes playback, note highlighting, and scoring.

Phase 1 delivers the foundation: scaffolding, the parser, the pitch detector, and a minimal page that proves both work on desktop and mobile. Later phases add gameplay, the Resurrection theme, a song library, party flow, and an optional decorative ghost verdict.

## Architecture

```mermaid
flowchart LR
  subgraph ui [UI]
    SongPanel
    MicTest
    GameScreen
  end
  subgraph domain [Domain]
    Parser[parseUltraStar]
    YIN[detectPitchYin]
    Notes[note math]
    Scoring
  end
  File[UltraStar .txt] --> Parser
  Parser --> SongPanel
  Parser --> GameScreen
  Mic[Microphone] --> Analyser[AnalyserNode]
  Analyser --> YIN
  YIN --> Notes
  Notes --> MicTest
  Notes --> Scoring
  Parser --> Scoring
  Scoring --> GameScreen
```

The important boundary is that `src/parser` and `src/pitch` never import React, `document`, or Web Audio — except the `usePitchDetection` hook, which lives next to the detector but is the only module allowed to touch `getUserMedia` and `AudioContext`.

## Components

### Parser (`src/parser`)

- `parseUltraStar(text): ParsedSong` is the single entry point.
- Headers are case-insensitive, split on the first colon, and stored both as typed fields and as a raw map.
- Body lines are notes, phrase breaks (`- beat` or legacy `- start end`), voice changes (`P1`–`P9`), or `E`.
- Unknown official-incompatible note types become freestyle notes plus a warning, matching the format's guidance.
- `beatToMs` centralizes v1/unversioned vs v2 timing so gameplay does not reimplement it.

### Pitch detection (`src/pitch`)

- `detectPitchYin(samples, options)` implements YIN's difference function, cumulative-mean normalization, absolute threshold, and parabolic interpolation.
- `usePitchDetection` creates an `AudioContext`, pipes the mic into an `AnalyserNode` (`fftSize` 8192, no smoothing), and runs YIN on `getFloatTimeDomainData` inside `requestAnimationFrame`.
- `note.ts` converts frequency to MIDI and scientific names, maps UltraStar pitch 0 to C4 / MIDI 60, and compares pitches by pitch class within a default 50-cent window.

### Phase 1 UI

- `SongPanel` loads the bundled demo or a user-picked `.txt`, shows metadata, warnings, and lyric lines (golden syllables highlighted).
- `MicTest` is a large-note tuner with a cents needle, an input-level meter, a 48px+ start/stop control, and permission error copy for mobile.

### Later UI (not built in Phase 1)

- A gameplay screen with a note highway, current lyric, running score, and transport controls.
- A library / queue screen.
- A scoreboard and optional ghost-verdict end card.

## Data models

See `src/parser/types.ts` and `src/pitch/note.ts` for the source of truth. The important shapes:

- `SongHeaders`: title, artist, raw and typed BPM, gap, optional audio file, version, voice names, and the raw header map.
- `Note`: type, type character, start beat, duration, pitch (half-steps from C4), text, voice.
- `LyricLine`: grouped notes between phrase breaks, per voice, with concatenated text.
- `ParsedSong`: headers, notes, breaks, voices, lines, warnings.
- `LivePitch`: frequency, named note, probability, RMS.

Scoring (Phase 2) will introduce a `ScoreEvent` (time, note id, hit/miss, points) and a `RoundResult` (total, per-voice totals, grade). Those types should live in a new `src/game` module, not inside the parser.

## Timing and scoring approach

- Playback clock: `performance.now()` aligned to `AudioContext.currentTime` or the media element's current time, minus `#GAP`.
- Note window: a note is active from `beatToMs(start)` to `beatToMs(start + duration)`.
- Hit test, pitched notes: `comparePitchOctaveTolerant(sungMidi, 60 + note.pitch, 50)` (exact tolerance may be tuned in Phase 2 and must be documented).
- Hit test, rap notes: RMS above a threshold, pitch ignored.
- Freestyle: no points.
- Golden notes (and golden rap) get a configurable multiplier (UltraStar tradition is typically 2×; confirm during Phase 2 if we want an exact recreation).

## Error handling

| Situation | Behaviour |
| --- | --- |
| Empty or invalid song file | `UltraStarParseError`; UI banner, previous song cleared |
| Recoverable song issues | `warnings[]` shown in a collapsed list |
| Missing audio | Lyrics still visible; play disabled with an explanation |
| Mic permission denied | Status `denied` and instructions to use site settings |
| No mic / insecure context | Status `unsupported` or `error` with HTTPS guidance |
| Pitch detector silence | Clear the locked note; keep the level meter alive |

Microphone audio is processed locally and never uploaded for detection or scoring.

## Testing strategy

- **Parser:** fixture strings covering happy paths (headers, all note types, line breaks, duets, comma decimals, BOM, CRLF) and malformed input (missing headers, bad BPM/GAP/VERSION, broken notes, P0, overlaps as warnings). The bundled demo song has its own parse test.
- **Pitch:** synthesized sines at known frequencies (C4, A3–A5, E4, G3/G4, and a low E2 with a wider window). Silence and too-short buffers must return `null`. Note math is tested independently (A4 = 440 Hz = MIDI 69, octave-tolerant wrap at B/C).
- **Scoring (Phase 2):** pure functions with fake clocks and fake pitch streams; no live mic in CI.
- **Visual checks:** Playwright (or equivalent) screenshots at 1280×800 and 390×844 are stored under `screenshots/phaseN/` as evidence, not as flaky CI assertions in Phase 1.

## Deployment (Phase 3)

Static hosting (for example GitHub Pages or Cloudflare Pages) is enough: `npm run build` emits a static `dist/`. Confirm the exact host with Ilias before attaching a custom domain or making the repo public.

## Security and licensing

- File references in UltraStar headers are informational in the browser; never follow absolute paths from a song file to the host disk.
- Demo songs in this repository must be original and copyright-free. User-supplied files stay on the user's device.
- Ghost avatars and verdict text must not depict or impersonate a real artist.
