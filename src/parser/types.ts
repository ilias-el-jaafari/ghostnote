export type NoteType = 'regular' | 'golden' | 'rap' | 'goldenRap' | 'freestyle'

export type ParseWarning = {
  lineNumber: number
  message: string
}

export type SongHeaders = {
  title: string
  artist: string
  /** Raw #BPM value from the file (comma or period decimal). */
  bpm: number
  /** Milliseconds from the start of the audio until beat 0. Defaults to 0. */
  gap: number
  /** File name from #AUDIO, or #MP3 if #AUDIO is absent. */
  audioFile: string | undefined
  /** UltraStar format version, if declared. */
  version: string | undefined
  year: string | undefined
  genre: string | undefined
  language: string | undefined
  cover: string | undefined
  video: string | undefined
  /** YouTube id from `#VIDEO` (`v=` / `a=` / URL) or `#YOUTUBE`, if any. */
  youtubeId: string | undefined
  /** `video` when the id came from `v=` or a URL; `audio` when it came from `a=`. */
  youtubeKind: 'video' | 'audio' | undefined
  background: string | undefined
  /** Voice names from #P1/#P2 or #DUETSINGERP1/#DUETSINGERP2. */
  voiceNames: Record<number, string>
  /** Every header key (upper-case) to its raw trimmed value. */
  raw: Record<string, string>
}

export type Note = {
  type: NoteType
  /** Original type character, e.g. ':' or '*'. */
  typeChar: string
  startBeat: number
  duration: number
  /** Half-steps relative to C4 (UltraStar pitch 0). */
  pitch: number
  text: string
  voice: number
}

export type PhraseBreak = {
  startBeat: number
  /** Optional second beat found in some legacy files. */
  endBeat: number | undefined
  voice: number
}

export type LyricLine = {
  voice: number
  notes: Note[]
  startBeat: number
  endBeat: number
  text: string
}

export type ParsedSong = {
  headers: SongHeaders
  notes: Note[]
  breaks: PhraseBreak[]
  voices: number[]
  lines: LyricLine[]
  warnings: ParseWarning[]
}

export class UltraStarParseError extends Error {
  readonly lineNumber: number | undefined
  readonly line: string | undefined

  constructor(
    message: string,
    options: { lineNumber?: number; line?: string } = {},
  ) {
    super(message)
    this.name = 'UltraStarParseError'
    this.lineNumber = options.lineNumber
    this.line = options.line
  }
}
