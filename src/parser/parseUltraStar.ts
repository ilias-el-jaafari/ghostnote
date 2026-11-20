import {
  UltraStarParseError,
  type LyricLine,
  type Note,
  type NoteType,
  type ParsedSong,
  type ParseWarning,
  type PhraseBreak,
  type SongHeaders,
} from './types.ts'

export { UltraStarParseError }

const NOTE_TYPES: Record<string, NoteType> = {
  ':': 'regular',
  '*': 'golden',
  R: 'rap',
  G: 'goldenRap',
  F: 'freestyle',
}

const REQUIRED_HEADERS = ['TITLE', 'ARTIST', 'BPM'] as const

/**
 * Convert an UltraStar beat index into milliseconds.
 *
 * Format v1 and unversioned files implicitly quadruple #BPM
 * (a value of 10.5 means 42 beats per minute), which is how
 * UltraStar Deluxe times notes: `gap + beat * 60000 / (bpm * 4)`.
 * Format v2 uses the BPM value as-is.
 */
export function beatToMs(
  beat: number,
  bpm: number,
  gap = 0,
  version?: string,
): number {
  if (!(bpm > 0)) {
    throw new UltraStarParseError('BPM must be a positive number to convert beats')
  }
  const multiplier = isV2(version) ? 1 : 4
  return gap + (beat * 60_000) / (bpm * multiplier)
}

export function isV2(version: string | undefined): boolean {
  if (!version) return false
  const major = Number.parseInt(version, 10)
  return major === 2
}

/** Parse a decimal that may use a comma or a period as the separator. */
export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '' || /[^0-9.eE+-]/.test(normalized)) {
    return Number.NaN
  }
  // Reject more than one decimal point after normalization.
  if ((normalized.match(/\./g) ?? []).length > 1) {
    return Number.NaN
  }
  return Number(normalized)
}

function splitLines(text: string): string[] {
  // Accept LF, CR, and CRLF. Keep a trailing empty entry only if the
  // file ended with a newline — empty lines are ignored later anyway.
  return text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
}

function parseVoiceChange(trimmed: string): number | undefined {
  const match = /^P\s*([0-9])\s*$/.exec(trimmed)
  if (!match || match[1] === undefined) return undefined
  return Number(match[1])
}

function parseHeaderLine(
  trimmed: string,
): { key: string; value: string } | undefined {
  if (!trimmed.startsWith('#')) return undefined
  const colon = trimmed.indexOf(':')
  if (colon === -1) return undefined
  const key = trimmed.slice(1, colon).trim().toUpperCase()
  const value = trimmed.slice(colon + 1).trim()
  if (key === '') return undefined
  return { key, value }
}

function classifyNoteType(
  typeChar: string,
  lineNumber: number,
  warnings: ParseWarning[],
): NoteType {
  const known = NOTE_TYPES[typeChar]
  if (known) return known
  warnings.push({
    lineNumber,
    message: `Unknown note type "${typeChar}" treated as freestyle`,
  })
  return 'freestyle'
}

function toLyricLine(voice: number, lineNotes: Note[]): LyricLine {
  const first = lineNotes[0]
  const last = lineNotes[lineNotes.length - 1]
  if (!first || !last) {
    throw new UltraStarParseError('Cannot build a lyric line without notes')
  }
  return {
    voice,
    notes: lineNotes,
    startBeat: first.startBeat,
    endBeat: last.startBeat + last.duration,
    text: lineNotes.map((note) => note.text).join(''),
  }
}

function buildLines(notes: Note[], breaks: PhraseBreak[]): LyricLine[] {
  const voices = [...new Set(notes.map((note) => note.voice))].sort((a, b) => a - b)
  const lines: LyricLine[] = []

  for (const voice of voices) {
    const voiceNotes = notes.filter((note) => note.voice === voice)
    const voiceBreaks = breaks
      .filter((item) => item.voice === voice)
      .map((item) => item.startBeat)
      .sort((a, b) => a - b)

    let breakIndex = 0
    let current: Note[] = []

    const flush = () => {
      if (current.length > 0) {
        lines.push(toLyricLine(voice, current))
        current = []
      }
    }

    for (const note of voiceNotes) {
      while (
        breakIndex < voiceBreaks.length &&
        voiceBreaks[breakIndex] !== undefined &&
        note.startBeat >= (voiceBreaks[breakIndex] as number)
      ) {
        flush()
        breakIndex += 1
      }
      current.push(note)
    }
    flush()
  }

  return lines
}

function applyVoiceNameAliases(raw: Record<string, string>): Record<number, string> {
  const names: Record<number, string> = {}
  for (let voice = 1; voice <= 9; voice += 1) {
    const primary = raw[`P${voice}`]
    const legacy = raw[`DUETSINGERP${voice}`]
    const name = primary || legacy
    if (name) names[voice] = name
  }
  return names
}

export function parseUltraStar(text: string): ParsedSong {
  if (typeof text !== 'string') {
    throw new UltraStarParseError('Song file must be text')
  }

  const lines = splitLines(text)
  if (lines.every((line) => line.trim() === '')) {
    throw new UltraStarParseError('Song file is empty')
  }

  const warnings: ParseWarning[] = []
  const raw: Record<string, string> = {}
  const notes: Note[] = []
  const breaks: PhraseBreak[] = []
  const seenVoices = new Set<number>()

  let inBody = false
  let ended = false
  let currentVoice = 1
  let implicitVoice = true
  let sawEndMarker = false

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    const rawLine = lines[index] ?? ''
    const trimmed = rawLine.trim()

    if (trimmed === '') continue
    if (ended) continue

    if (trimmed === 'E' || trimmed === 'e') {
      sawEndMarker = true
      ended = true
      continue
    }

    if (!inBody) {
      const header = parseHeaderLine(trimmed)
      if (header) {
        if (header.value !== '') {
          raw[header.key] = header.value
        } else {
          // An empty value is equivalent to the header being absent.
          delete raw[header.key]
        }
        continue
      }
      inBody = true
    }

    // Body
    const voice = parseVoiceChange(trimmed)
    if (voice !== undefined) {
      if (voice === 0) {
        throw new UltraStarParseError('P0 is not a valid voice change', {
          lineNumber,
          line: rawLine,
        })
      }
      currentVoice = voice
      implicitVoice = false
      seenVoices.add(voice)
      continue
    }

    // Some legacy files use "P1" without a following body yet, already handled.
    // End-of-phrase: "- <beat>" or legacy "- <start> <end>"
    if (trimmed.startsWith('-')) {
      const rest = trimmed.slice(1).trim()
      const parts = rest.split(/\s+/)
      const startBeat = parseDecimal(parts[0] ?? '')
      if (!Number.isFinite(startBeat)) {
        throw new UltraStarParseError('Phrase break is missing a valid beat', {
          lineNumber,
          line: rawLine,
        })
      }
      const endBeatRaw = parts[1]
      const endBeat =
        endBeatRaw !== undefined && Number.isFinite(parseDecimal(endBeatRaw))
          ? parseDecimal(endBeatRaw)
          : undefined
      breaks.push({ startBeat, endBeat, voice: currentVoice })
      if (implicitVoice) seenVoices.add(currentVoice)
      continue
    }

    // Note line: TYPE START DURATION PITCH TEXT
    const firstSpace = trimmed.search(/\s/)
    if (firstSpace <= 0) {
      throw new UltraStarParseError('Unrecognized line in song body', {
        lineNumber,
        line: rawLine,
      })
    }

    const typeChar = trimmed.slice(0, firstSpace)
    if (typeChar.length !== 1) {
      throw new UltraStarParseError('Note type must be a single character', {
        lineNumber,
        line: rawLine,
      })
    }

    const afterType = trimmed.slice(firstSpace).trimStart()
    const fieldMatch = /^(-?\d+)\s+(-?\d+)\s+(-?\d+)(?:\s(.*))?$/.exec(afterType)
    if (!fieldMatch) {
      throw new UltraStarParseError(
        'Note line must be: type startBeat duration pitch [text]',
        { lineNumber, line: rawLine },
      )
    }

    const startBeat = Number(fieldMatch[1])
    const duration = Number(fieldMatch[2])
    const pitch = Number(fieldMatch[3])
    // Preserve leading spaces in the syllable; they separate words.
    const text = fieldMatch[4] ?? ''

    if (!Number.isInteger(startBeat) || startBeat < 0) {
      throw new UltraStarParseError('Note start beat must be a non-negative integer', {
        lineNumber,
        line: rawLine,
      })
    }
    if (!Number.isInteger(duration) || duration < 0) {
      throw new UltraStarParseError('Note duration must be a non-negative integer', {
        lineNumber,
        line: rawLine,
      })
    }
    if (!Number.isInteger(pitch)) {
      throw new UltraStarParseError('Note pitch must be an integer', {
        lineNumber,
        line: rawLine,
      })
    }
    if (duration === 0) {
      warnings.push({
        lineNumber,
        message: 'Note has a duration of 0 beats',
      })
    }

    const type = classifyNoteType(typeChar, lineNumber, warnings)
    notes.push({
      type,
      typeChar,
      startBeat,
      duration,
      pitch,
      text,
      voice: currentVoice,
    })
    if (implicitVoice) seenVoices.add(currentVoice)
  }

  if (!sawEndMarker) {
    warnings.push({
      lineNumber: lines.length,
      message: 'Song file does not end with an E marker',
    })
  }

  const title = raw.TITLE
  const artist = raw.ARTIST
  const bpmRaw = raw.BPM

  for (const key of REQUIRED_HEADERS) {
    if (!raw[key]) {
      throw new UltraStarParseError(`Missing required #${key} header`)
    }
  }

  const bpm = parseDecimal(bpmRaw ?? '')
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new UltraStarParseError('#BPM must be a positive number')
  }

  const gap = raw.GAP !== undefined ? parseDecimal(raw.GAP) : 0
  if (!Number.isFinite(gap) || gap < 0) {
    throw new UltraStarParseError('#GAP must be a non-negative number')
  }

  const version = raw.VERSION
  if (version !== undefined) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
    if (!match || match[1] === undefined) {
      throw new UltraStarParseError(`Invalid #VERSION value "${version}"`)
    }
    const major = Number(match[1])
    if (major >= 3) {
      throw new UltraStarParseError(
        `Unsupported UltraStar format version ${version}`,
      )
    }
    if (major < 1) {
      throw new UltraStarParseError(`Invalid #VERSION value "${version}"`)
    }
  }

  const encoding = raw.ENCODING
  if (
    encoding !== undefined &&
    !/^(utf-?8)$/i.test(encoding) &&
    encoding.toUpperCase() !== 'UTF8'
  ) {
    warnings.push({
      lineNumber: 1,
      message: `#ENCODING "${encoding}" is not UTF-8; the file was parsed as Unicode text`,
    })
  }

  const audioFile = raw.AUDIO || raw.MP3
  if (!audioFile) {
    warnings.push({
      lineNumber: 1,
      message: 'Missing #MP3 or #AUDIO header; playback will not be available',
    })
  }

  if (notes.length === 0) {
    throw new UltraStarParseError('Song file contains no notes')
  }

  // Overlap check per voice (warning only).
  const byVoice = new Map<number, Note[]>()
  for (const note of notes) {
    const list = byVoice.get(note.voice) ?? []
    list.push(note)
    byVoice.set(note.voice, list)
  }
  for (const [voice, voiceNotes] of byVoice) {
    const sorted = [...voiceNotes].sort((a, b) => a.startBeat - b.startBeat)
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]
      const next = sorted[i]
      if (!prev || !next) continue
      if (next.startBeat < prev.startBeat + prev.duration) {
        warnings.push({
          lineNumber: 1,
          message: `Overlapping notes in voice ${voice} at beat ${next.startBeat}`,
        })
      }
    }
  }

  const voiceNames = applyVoiceNameAliases(raw)
  const voices = [...seenVoices].sort((a, b) => a - b)

  const headers: SongHeaders = {
    title: title ?? '',
    artist: artist ?? '',
    bpm,
    gap,
    audioFile,
    version,
    year: raw.YEAR,
    genre: raw.GENRE,
    language: raw.LANGUAGE,
    cover: raw.COVER,
    video: raw.VIDEO,
    background: raw.BACKGROUND,
    voiceNames,
    raw,
  }

  return {
    headers,
    notes,
    breaks,
    voices,
    lines: buildLines(notes, breaks),
    warnings,
  }
}
