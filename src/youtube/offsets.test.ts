import { describe, expect, it } from 'vitest'
import {
  clampOffsetMs,
  persistSongOffset,
  readSongOffset,
  songOffsetKey,
  YT_OFFSET_STORAGE_KEY,
} from './offsets.ts'

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

describe('youtube offsets', () => {
  it('defaults to 0 when nothing is stored (header ids are already GAP-timed)', () => {
    const storage = memoryStorage()
    const key = songOffsetKey({ videoId: 'abcdeFGHIJ1', title: 'Demo', artist: 'Fixture' })
    expect(readSongOffset(key, storage)).toBe(0)
  })

  it('persists and reads a per-song offset', () => {
    const storage = memoryStorage()
    const key = songOffsetKey({ videoId: 'abcdeFGHIJ1', title: 'Demo', artist: 'Fixture' })
    persistSongOffset(key, 250, storage)
    expect(readSongOffset(key, storage)).toBe(250)
    expect(storage.data[YT_OFFSET_STORAGE_KEY]).toContain('250')
    const other = songOffsetKey({ videoId: 'abcdeFGHIJ1', title: 'Other', artist: 'Fixture' })
    expect(readSongOffset(other, storage)).toBe(0)
  })

  it('clamps extreme values', () => {
    expect(clampOffsetMs(50.4)).toBe(50)
    expect(clampOffsetMs(99_999)).toBe(10_000)
    expect(clampOffsetMs(-99_999)).toBe(-10_000)
  })
})
