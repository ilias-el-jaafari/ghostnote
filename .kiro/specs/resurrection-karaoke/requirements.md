# Requirements Document

## Introduction

WakeStar resurrects UltraStar as a web karaoke game for a party with friends. Players load an UltraStar `.txt` song (or a built-in copyright-free demo), sing into the device microphone, and are scored in real time. The app must work equally well on a computer and a phone. This specification covers the whole product, delivered in five phases.

## Glossary

- **UltraStar file**: A `.txt` song in the UltraStar Deluxe format, with `#` headers and a body of notes, phrase breaks, and optional voice changes.
- **Note**: A timed syllable with a pitch (half-steps from C4) and a type (`:`, `*`, `R`, `G`, or `F`).
- **Octave-tolerant match**: Two pitches are the same pitch class (for example C4 and C5), within a configured cent tolerance, regardless of octave.
- **Ghost verdict**: An optional, decorative end-of-song message spoken in a fictional persona inspired by the era of the song, never by impersonating a real artist.

## Requirements

### Requirement 1: Load and parse UltraStar songs

**User Story:** As a party host, I want to open UltraStar `.txt` songs I already have (or a built-in demo), so that we can sing familiar charts in the browser.

#### Acceptance Criteria

1. WHEN a user provides a valid UltraStar `.txt` file, THE SYSTEM SHALL parse its headers (including `#TITLE`, `#ARTIST`, `#BPM`, `#GAP`, `#MP3` or `#AUDIO`) and its body (regular, golden, rap, golden-rap, and freestyle notes, phrase breaks, and the `E` end marker).
2. WHEN `#BPM` or `#GAP` use a comma as the decimal separator, THE SYSTEM SHALL parse them as decimal numbers.
3. WHEN the file contains `P1`/`P2` (or `P 1`) voice changes and optional `#P1`/`#P2` or `#DUETSINGERP1`/`#DUETSINGERP2` names, THE SYSTEM SHALL assign notes and lyric lines to the matching voice.
4. WHEN the file is missing a required `#TITLE`, `#ARTIST`, or `#BPM` header, or a note line cannot be parsed, THE SYSTEM SHALL reject the file with a clear error that includes a line number when the problem is on a specific line.
5. WHEN the file has recoverable issues (missing `E`, unknown note type, missing audio header, duration 0, overlapping notes), THE SYSTEM SHALL still parse it and report those issues as warnings.
6. WHEN converting beats to time for an unversioned or v1 file, THE SYSTEM SHALL use the historical implicit BPM quadrupling (`gap + beat * 60000 / (bpm * 4)`). WHEN `#VERSION` is 2.x, THE SYSTEM SHALL use the BPM value as-is.
7. IF `#VERSION` is not a valid `X.Y.Z` triplet or its major version is 3 or higher, THE SYSTEM SHALL reject the file.

### Requirement 2: Detect sung pitch in the browser

**User Story:** As a singer, I want the app to hear the note I am singing into the microphone, so that I can trust the later score and check my mic before a party round.

#### Acceptance Criteria

1. WHEN the user starts the microphone with a tap or click, THE SYSTEM SHALL request microphone permission and, once granted, estimate the fundamental frequency from the live audio in real time using a YIN (or equivalent time-domain) detector.
2. WHEN a stable pitched signal is present, THE SYSTEM SHALL display the nearest note name and octave, the frequency in hertz, and the detuning in cents.
3. WHEN the input is silence or too quiet, THE SYSTEM SHALL not display a locked note.
4. WHEN comparing a sung pitch to a charted note, THE SYSTEM SHALL provide an octave-tolerant comparison so that singing the correct pitch class in another octave can still count as a match, within a documented cent tolerance.
5. WHEN the browser cannot access a microphone, or the user denies permission, THE SYSTEM SHALL explain what happened and how to fix it, including that a phone needs HTTPS (or localhost) and a user gesture.
6. THE SYSTEM SHALL run pitch detection entirely in the browser with no audio uploaded to a server.

### Requirement 3: Real-time gameplay and scoring

**User Story:** As a singer at a party, I want to sing along with the song and see my score grow as I hit the notes, so that the round feels like UltraStar.

#### Acceptance Criteria

1. WHEN a parsed song with playable audio is started, THE SYSTEM SHALL scroll or highlight the current lyric line and upcoming notes in time with playback, using `#GAP` and `#BPM` for note timing.
2. WHILE a regular or golden note is active, THE SYSTEM SHALL compare the live sung pitch to the charted pitch (octave-tolerant) and award points for hits, with golden notes worth more than regular notes.
3. WHILE a rap or golden-rap note is active, THE SYSTEM SHALL ignore pitch and award points for presence of voice in time, with golden-rap worth more than rap.
4. WHILE a freestyle note is active, THE SYSTEM SHALL display the lyric but SHALL NOT award points.
5. WHEN the song ends, THE SYSTEM SHALL show a total score and a simple grade or ranking that the group can read from across the room.
6. WHEN the user pauses, restarts, or leaves the round, THE SYSTEM SHALL stop scoring cleanly and release or pause audio playback.

### Requirement 4: Desktop and mobile as equals

**User Story:** As a guest at a party, I want to use the app on a laptop or a phone without feeling that one of them is a compromise, so that whoever is holding a device can sing.

#### Acceptance Criteria

1. WHEN the viewport is a typical phone (around 390px wide) or a typical laptop, THE SYSTEM SHALL present a usable layout with readable lyrics and touch targets of at least 44px on interactive controls.
2. WHEN the app is opened on a mobile browser, THE SYSTEM SHALL request the microphone only after a user gesture and SHALL surface permission failures clearly.
3. THE SYSTEM SHALL ship a web app manifest and mobile web-app metadata so it can be added to the home screen (PWA-ready). Offline caching is optional and must not block singing when the app is served over the network.
4. THE SYSTEM SHALL remain usable in both landscape and portrait, with the scoring/lyrics view remaining readable in either orientation.

### Requirement 5: Resurrection presentation

**User Story:** As a player and as a contest judge, I want the interface to feel like classic UltraStar coming back to life, so that the Resurrection category is obvious without turning the party into a horror game.

#### Acceptance Criteria

1. THE SYSTEM SHALL use a visual theme that recalls early-2000s UltraStar (dark stage, neon note bars, a slightly retro typography) and then reads as a modern, polished web UI.
2. WHEN notes are shown on the gameplay screen, THE SYSTEM SHALL give them a subtle ghostly green glow, with golden notes remaining distinctly gold.
3. THE SYSTEM SHALL keep Halloween cues light: atmosphere and motion, not gore, jump scares, or decoration that hides the lyrics or the score.
4. THE SYSTEM SHALL remain fully playable if motion or decorative effects are reduced (for example via `prefers-reduced-motion`).

### Requirement 6: Song library and custom files

**User Story:** As a host, I want a few ready-to-sing original songs and a way to add our own UltraStar files, so that we can start a party without hunting for charts first.

#### Acceptance Criteria

1. THE SYSTEM SHALL include one or more original, copyright-free demo songs (text plus audio) that can be started without any file picker.
2. WHEN the user selects a local UltraStar `.txt` file, THE SYSTEM SHALL parse it and, if a matching audio file is also provided or referenced in a way the browser can read, make the song playable.
3. THE SYSTEM SHALL NOT ship copyrighted commercial recordings or third-party song charts in the repository.
4. WHEN a song cannot be played because audio is missing, THE SYSTEM SHALL still show the parsed lyrics and metadata and explain what is needed to play.

### Requirement 7: Party features

**User Story:** As a group of friends, we want to take turns, sing duets, and see who is winning, so that the app feels like a party game and not a solo practice tool.

#### Acceptance Criteria

1. WHEN more than one person wants to sing, THE SYSTEM SHALL support a simple turn-taking or queue flow so the next singer can be chosen without reloading the app.
2. WHEN a song has two (or more) voices, THE SYSTEM SHALL allow a duet performance that scores those voices separately.
3. THE SYSTEM SHALL show a scoreboard that remains readable to people standing a short distance from the screen.
4. IF a networked "phones as mics, TV as screen" mode is added, THE SYSTEM SHALL treat it as an enhancement of local play, not a requirement to start a party.

### Requirement 8: Optional ghost verdict

**User Story:** As a singer finishing a round, I want a funny, in-world verdict from a ghostly persona inspired by the song's era, so that the ending has character without copying a real artist.

#### Acceptance Criteria

1. WHEN a song finishes and this feature is enabled, THE SYSTEM SHALL show a short written verdict in a fictional persona inspired by the era or mood of the song, based on how well the singer scored.
2. THE SYSTEM SHALL NOT imitate the voice, likeness, name, or distinctive speaking style of a real artist.
3. IF image generation is used, THE SYSTEM SHALL generate a fictional ghost avatar that does not depict a real person, and the feature SHALL degrade gracefully to the written verdict when generation is unavailable.
4. THE SYSTEM SHALL keep this feature optional and decorative: gameplay and scoring MUST work when the verdict is disabled or fails.

### Requirement 9: Quality, safety, and contest packaging

**User Story:** As the contestant, I want the project to be tested, documented in Kiro's format, and ready to submit, so that the entry is eligible and maintainable under a tight deadline.

#### Acceptance Criteria

1. THE SYSTEM SHALL be developed in phases, and THE SYSTEM SHALL have automated tests for parsing and pitch detection (and later for scoring math) that pass before the next phase starts.
2. THE REPOSITORY SHALL contain a `.kiro` folder at the root with steering files, at least one spec (`requirements.md`, `design.md`, `tasks.md`), and one or more hooks.
3. THE REPOSITORY SHALL be made public on GitHub only when Ilias confirms the name and is ready to publish. A demo video under 3 minutes and a Devpost write-up are required before the 4 December 2026, 23:00 Europe/Madrid deadline.
4. THE SYSTEM SHALL not require an account to sing, and SHALL not upload microphone audio to a remote server for pitch detection or scoring.
