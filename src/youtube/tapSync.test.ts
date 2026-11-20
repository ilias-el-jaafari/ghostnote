import { describe, expect, it } from 'vitest'
import {
  averageTapOffset,
  countdownToFirstNote,
  NUDGE_LARGE_MS,
  NUDGE_SMALL_MS,
  offsetFromTap,
} from './tapSync.ts'
import { persistSongOffset, readSongOffset, songOffsetKey } from './offsets.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
    data,
  }
}

describe('offsetFromTap', () => {
  it('is expectedFirstNote − tapTime so songTime = mediaTime + offset', () => {
    // First chart note at 7.4 s; singer hears it at 10.0 s in the instrumental.
    expect(offsetFromTap(10_000, 7400)).toBe(-2600)
    // Instrumental starts earlier than the chart.
    expect(offsetFromTap(2000, 7400)).toBe(5400)
    // Already aligned.
    expect(offsetFromTap(7400, 7400)).toBe(0)
  })
})

describe('averageTapOffset', () => {
  it('averages repeated taps and rounds to a whole millisecond', () => {
    const expected = 7400
    // Taps at 10.00, 10.08, 9.94 s.
    expect(averageTapOffset([10_000, 10_080, 9940], expected)).toBe(
      Math.round(((-2600) + (-2680) + (-2540)) / 3),
    )
    expect(averageTapOffset([], expected)).toBe(0)
  })
})

describe('countdownToFirstNote', () => {
  it('counts down to the chart’s first note on the raw media clock', () => {
    expect(countdownToFirstNote(7400, 0)).toBe(7400)
    expect(countdownToFirstNote(7400, 7400)).toBe(0)
    expect(countdownToFirstNote(7400, 8000)).toBe(-600)
  })
})

describe('tap-sync persistence', () => {
  it('stores the averaged offset per song + video id', () => {
    const storage = memoryStorage()
    const key = songOffsetKey({
      videoId: 'InstrId_001',
      artist: 'Stevie Wonder',
      title: 'I Just Called To Say I Love You',
    })
    const offset = averageTapOffset([10_000, 10_040], 7400)
    persistSongOffset(key, offset, storage)
    expect(readSongOffset(key, storage)).toBe(offset)
    const otherVideo = songOffsetKey({
      videoId: 'InstrId_002',
      artist: 'Stevie Wonder',
      title: 'I Just Called To Say I Love You',
    })
    expect(readSongOffset(otherVideo, storage)).toBe(0)
  })

  it('nudges stay on the 10 / 50 ms steps', () => {
    expect(NUDGE_SMALL_MS).toBe(10)
    expect(NUDGE_LARGE_MS).toBe(50)
  })
})
