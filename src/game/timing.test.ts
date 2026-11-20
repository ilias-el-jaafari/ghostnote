import { describe, expect, it } from 'vitest'
import { beatToMs, parseUltraStar } from '../parser/index.ts'
import {
  activeNotes,
  beatDurationMs,
  buildTimeline,
  lineAt,
  msToBeat,
  nextLine,
  noteAt,
} from './timing.ts'

const DEMO = `#TITLE:Midnight Echo
#ARTIST:The Night Owls
#BPM:120
#GAP:0
#MP3:midnight-echo.ogg
: 0 4 0 Mid
: 4 4 2 night
: 8 8 4  e
: 16 8 5 cho
- 28
: 32 4 0 Sing
: 36 4 2  with
: 40 4 4  the
* 44 8 7  glow
- 56
: 64 4 0 Rise
: 68 4 5  and
: 72 8 7  shine
- 84
: 88 4 0 Mid
: 92 4 2 night
: 96 8 4  e
* 104 12 0 cho
E
`

describe('beatDurationMs and msToBeat', () => {
  it('is the inverse of beatToMs for unversioned / v1 timing (implicit *4)', () => {
    expect(beatDurationMs(120)).toBe(125)
    expect(beatDurationMs(120, '1.0.0')).toBe(125)
    expect(msToBeat(500, 120, 0)).toBe(4)
    expect(msToBeat(1500, 120, 1000, '1.0.0')).toBe(4)
    for (const beat of [0, 1, 4, 16, 44, 116]) {
      const ms = beatToMs(beat, 120, 0)
      expect(msToBeat(ms, 120, 0)).toBeCloseTo(beat, 10)
    }
  })

  it('respects GAP and does not quadruple BPM for format v2', () => {
    expect(beatDurationMs(120, '2.0.0')).toBe(500)
    expect(msToBeat(2000, 120, 0, '2.0.0')).toBe(4)
    expect(msToBeat(3000, 120, 1000, '2.0.0')).toBe(4)
    const ms = beatToMs(8, 100, 250, '2.0.0')
    expect(msToBeat(ms, 100, 250, '2.0.0')).toBeCloseTo(8, 10)
  })

  it('matches the official v1 example (10.5 BPM → 42 beats per minute)', () => {
    expect(beatDurationMs(10.5, '1.0.0')).toBeCloseTo(60_000 / 42, 10)
    expect(msToBeat(60_000 / 42, 10.5, 0, '1.0.0')).toBeCloseTo(1, 10)
  })

  it('throws when BPM is not positive', () => {
    expect(() => beatDurationMs(0)).toThrow(RangeError)
    expect(() => msToBeat(1, -8)).toThrow(RangeError)
  })
})

describe('buildTimeline', () => {
  const song = parseUltraStar(DEMO)
  const timeline = buildTimeline(song, { countInMs: 2000, tailMs: 1000 })

  it('times every demo note with 125 ms beats and a 1s tail after the last note', () => {
    expect(timeline.beatDurationMs).toBe(125)
    expect(timeline.notes).toHaveLength(song.notes.length)
    expect(timeline.notes[0]).toMatchObject({ startMs: 0, endMs: 500, text: 'Mid' })
    const glow = timeline.notes.find((note) => note.text === ' glow')
    expect(glow).toMatchObject({ startBeat: 44, startMs: 5500, endMs: 6500, type: 'golden' })
    // Last note: start 104, duration 12 → 116 beats * 125 = 14500
    expect(timeline.lastNoteMs).toBe(14_500)
    expect(timeline.endMs).toBe(15_500)
    expect(timeline.countInMs).toBe(2000)
    expect(timeline.firstNoteMs).toBe(0)
  })

  it('assigns notes to lyric lines and exposes helpers for the current / next line', () => {
    expect(timeline.lines).toHaveLength(4)
    expect(timeline.lines[1]?.text).toBe('Sing with the glow')
    expect(lineAt(timeline, 0)?.index).toBe(0)
    expect(lineAt(timeline, 3000)?.text).toBe('Midnight echo')
    expect(lineAt(timeline, 3999)?.text).toBe('Midnight echo')
    expect(lineAt(timeline, 4000)?.text).toBe('Sing with the glow')
    expect(nextLine(timeline, 1000)?.text).toBe('Sing with the glow')
    expect(nextLine(timeline, 14_000)).toBeUndefined()
    expect(noteAt(timeline, 5500)?.text).toBe(' glow')
    expect(noteAt(timeline, 6499)?.text).toBe(' glow')
    expect(noteAt(timeline, 6500)).toBeUndefined()
    expect(activeNotes(timeline, 0).map((note) => note.text)).toEqual(['Mid'])
  })

  it('filters duet voices and keeps v2 timing consistent', () => {
    const duet = parseUltraStar(`#TITLE:D
#ARTIST:A
#BPM:60
#VERSION:2.0.0
#GAP:100
#P1:One
#P2:Two
P1
: 0 2 0 a
- 4
: 8 2 0 b
P2
: 0 4 5 x
E
`)
    const p2 = buildTimeline(duet, { voice: 2, tailMs: 0, countInMs: 0 })
    expect(p2.notes).toHaveLength(1)
    expect(p2.notes[0]?.text).toBe('x')
    // v2: beat duration = 60000/60 = 1000ms, plus 100ms gap
    expect(p2.beatDurationMs).toBe(1000)
    expect(p2.notes[0]).toMatchObject({ startMs: 100, endMs: 4100 })
    expect(p2.msToBeat(p2.beatToMs(4))).toBeCloseTo(4, 10)
  })
})
