import { beatToMs, isV2, type LyricLine, type Note, type ParsedSong } from '../parser/index.ts'

export const DEFAULT_COUNT_IN_MS = 2000
export const DEFAULT_TAIL_MS = 1000

export type TimedNote = Note & {
  index: number
  lineIndex: number
  startMs: number
  endMs: number
}

export type TimedLine = LyricLine & {
  index: number
  startMs: number
  endMs: number
}

export type SongTimeline = {
  song: ParsedSong
  voice: number
  notes: TimedNote[]
  lines: TimedLine[]
  firstNoteMs: number
  lastNoteMs: number
  /** Song time when the round should end (last note plus a short tail). */
  endMs: number
  /** Lead-in before beat 0 / first audio moment, in milliseconds. */
  countInMs: number
  beatDurationMs: number
  beatToMs: (beat: number) => number
  msToBeat: (ms: number) => number
}

export type BuildTimelineOptions = {
  voice?: number
  countInMs?: number
  tailMs?: number
}

/**
 * Milliseconds per UltraStar beat, using the same v1/v2 rule as `beatToMs`.
 */
export function beatDurationMs(bpm: number, version?: string): number {
  if (!(bpm > 0)) {
    throw new RangeError('BPM must be a positive number')
  }
  const multiplier = isV2(version) ? 1 : 4
  return 60_000 / (bpm * multiplier)
}

/**
 * Inverse of `beatToMs`: convert a song time in milliseconds back to a (possibly fractional) beat.
 */
export function msToBeat(
  ms: number,
  bpm: number,
  gap = 0,
  version?: string,
): number {
  if (!(bpm > 0)) {
    throw new RangeError('BPM must be a positive number')
  }
  const multiplier = isV2(version) ? 1 : 4
  return ((ms - gap) * (bpm * multiplier)) / 60_000
}

export function buildTimeline(
  song: ParsedSong,
  options: BuildTimelineOptions = {},
): SongTimeline {
  const voice = options.voice ?? song.voices[0] ?? 1
  const countInMs = options.countInMs ?? DEFAULT_COUNT_IN_MS
  const tailMs = options.tailMs ?? DEFAULT_TAIL_MS
  const { bpm, gap, version } = song.headers

  const toMs = (beat: number) => beatToMs(beat, bpm, gap, version)
  const fromMs = (ms: number) => msToBeat(ms, bpm, gap, version)
  const duration = beatDurationMs(bpm, version)

  const lines = song.lines
    .filter((line) => line.voice === voice)
    .map((line, index) => ({
      ...line,
      index,
      startMs: toMs(line.startBeat),
      endMs: toMs(line.endBeat),
    }))

  const lineIndexByNote = new Map<Note, number>()
  for (const line of lines) {
    for (const note of line.notes) {
      lineIndexByNote.set(note, line.index)
    }
  }

  const notes = song.notes
    .filter((note) => note.voice === voice)
    .map((note, index) => {
      const lineIndex = lineIndexByNote.get(note)
      if (lineIndex === undefined) {
        throw new Error(`Note at beat ${note.startBeat} is missing a lyric line`)
      }
      return {
        ...note,
        index,
        lineIndex,
        startMs: toMs(note.startBeat),
        endMs: toMs(note.startBeat + note.duration),
      }
    })

  const firstNoteMs = notes[0]?.startMs ?? 0
  const lastNoteMs = notes.reduce((max, note) => Math.max(max, note.endMs), 0)

  return {
    song,
    voice,
    notes,
    lines,
    firstNoteMs,
    lastNoteMs,
    endMs: lastNoteMs + tailMs,
    countInMs,
    beatDurationMs: duration,
    beatToMs: toMs,
    msToBeat: fromMs,
  }
}

export function lineAt(timeline: SongTimeline, timeMs: number): TimedLine | undefined {
  let current: TimedLine | undefined
  for (const line of timeline.lines) {
    if (line.startMs <= timeMs) current = line
    if (line.startMs > timeMs) break
  }
  return current
}

export function nextLine(
  timeline: SongTimeline,
  timeMs: number,
): TimedLine | undefined {
  return timeline.lines.find((line) => line.startMs > timeMs)
}

export function activeNotes(timeline: SongTimeline, timeMs: number): TimedNote[] {
  return timeline.notes.filter((note) => note.startMs <= timeMs && timeMs < note.endMs)
}

export function noteAt(timeline: SongTimeline, timeMs: number): TimedNote | undefined {
  return timeline.notes.find((note) => note.startMs <= timeMs && timeMs < note.endMs)
}
