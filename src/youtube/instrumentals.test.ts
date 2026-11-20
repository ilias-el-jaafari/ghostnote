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
  resolvePlayback,
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
  it('opens a YouTube search for artist, title, instrumental (no “karaoke”)', () => {
    expect(instrumentalSearchQuery('Beyoncé', 'Halo')).toBe('Beyoncé Halo instrumental')
    const url = instrumentalSearchUrl('Beyoncé', 'Halo')
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('Halo instrumental')
    expect(decodeURIComponent(url)).not.toContain('karaoke')
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

describe('resolvePlayback — never start silently', () => {
  it('uses a resolved instrumental id when one is available', () => {
    const plan = resolvePlayback({
      source: 'instrumental',
      instrumentalId: 'InstrId_001',
      originalYoutubeId: 'OrigId___01',
    })
    expect(plan.kind).toBe('instrumental')
    expect(plan.youtubeId).toBe('InstrId_001')
    expect(plan.fallbackToOriginal).toBe(false)
    expect(plan.silent).toBe(false)
  })

  it('falls back to the original #VIDEO id when no instrumental was found', () => {
    const plan = resolvePlayback({
      source: 'instrumental',
      originalYoutubeId: 'OrigId___01',
      originalFromHeader: true,
    })
    expect(plan.kind).toBe('original-youtube')
    expect(plan.youtubeId).toBe('OrigId___01')
    expect(plan.youtubeFromHeader).toBe(true)
    expect(plan.fallbackToOriginal).toBe(true)
    expect(plan.silent).toBe(false)
  })

  it('falls back to the local original file when there is no #VIDEO id', () => {
    const plan = resolvePlayback({
      source: 'instrumental',
      localAudioUrl: 'blob:audio',
    })
    expect(plan.kind).toBe('original-file')
    expect(plan.audioUrl).toBe('blob:audio')
    expect(plan.fallbackToOriginal).toBe(true)
    expect(plan.silent).toBe(false)
  })

  it('is silent only when instrumental mode has nothing at all to play', () => {
    const plan = resolvePlayback({ source: 'instrumental' })
    expect(plan.kind).toBe('none')
    expect(plan.silent).toBe(true)
    expect(plan.youtubeId).toBeUndefined()
    expect(plan.audioUrl).toBeUndefined()
  })

  it('does not treat a mock player as silent', () => {
    const plan = resolvePlayback({ source: 'instrumental', mock: true })
    expect(plan.silent).toBe(false)
    expect(plan.kind).toBe('instrumental')
  })
})
