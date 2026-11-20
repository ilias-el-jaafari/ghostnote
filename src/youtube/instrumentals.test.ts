import { describe, expect, it } from 'vitest'
import {
  defaultSource,
  instrumentalSearchQuery,
  instrumentalSearchUrl,
  parseYouTubeIds,
  persistInstrumentalId,
  persistSourcePreference,
  readInstrumentalId,
  readSourcePreference,
  songIdentityKey,
} from './instrumentals.ts'

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

describe('songIdentityKey', () => {
  it('is stable across casing, accents, and punctuation', () => {
    expect(songIdentityKey('Stevie Wonder', 'I Just Called To Say I Love You')).toBe(
      songIdentityKey('stevie wonder', 'I just called to say I love you!'),
    )
    expect(songIdentityKey('Beyoncé', 'Halo')).toBe(songIdentityKey('Beyonce', 'Halo'))
  })
})

describe('instrumentalSearchUrl', () => {
  it('opens a YouTube search for artist, title, karaoke instrumental', () => {
    expect(instrumentalSearchQuery('Beyoncé', 'Halo')).toBe('Beyoncé Halo karaoke instrumental')
    const url = instrumentalSearchUrl('Beyoncé', 'Halo')
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('karaoke instrumental')
    expect(decodeURIComponent(url)).toContain('Halo')
  })
})

describe('parseYouTubeIds', () => {
  it('reads one or several pasted URLs / ids', () => {
    expect(parseYouTubeIds('https://www.youtube.com/watch?v=abcdefghijK')).toEqual(['abcdefghijK'])
    expect(
      parseYouTubeIds('https://youtu.be/abcdefghijK abcdefghiL0, https://www.youtube.com/watch?v=abcdeFGHIJ1'),
    ).toEqual(['abcdefghijK', 'abcdefghiL0', 'abcdeFGHIJ1'])
  })
})

describe('instrumental persistence', () => {
  it('remembers the chosen instrumental id per artist + title', () => {
    const storage = memoryStorage()
    const key = songIdentityKey('Whitney Houston', 'Saving All My Love For You')
    persistInstrumentalId(key, 'InstrId_001', storage)
    expect(readInstrumentalId(key, storage)).toBe('InstrId_001')
    expect(readInstrumentalId(songIdentityKey('Other Artist', 'Other Title'), storage)).toBeUndefined()
    persistInstrumentalId(key, undefined, storage)
    expect(readInstrumentalId(key, storage)).toBeUndefined()
  })

  it('remembers the original vs instrumental source choice', () => {
    const storage = memoryStorage()
    const key = songIdentityKey('Beyoncé', 'Halo')
    persistSourcePreference(key, 'instrumental', storage)
    expect(readSourcePreference(key, storage)).toBe('instrumental')
  })
})

describe('defaultSource', () => {
  it('prefers a saved choice, then a saved instrumental, then instrumental when there is no file', () => {
    expect(defaultSource({ saved: 'original', instrumentalId: 'x', hasLocalAudio: false })).toBe(
      'original',
    )
    expect(defaultSource({ instrumentalId: 'InstrId_001', hasLocalAudio: true })).toBe('instrumental')
    expect(defaultSource({ hasLocalAudio: false })).toBe('instrumental')
    expect(defaultSource({ hasLocalAudio: true })).toBe('original')
  })
})
