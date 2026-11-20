import { describe, expect, it, vi } from 'vitest'
import { compareDurations } from './duration.ts'
import {
  autoSelectInstrumental,
  chartDurationMs,
  fetchVideoDurationMs,
  parseIsoDurationMs,
  persistYoutubeApiKey,
  readYoutubeApiKey,
  referenceDurationMs,
  searchInstrumentals,
  TYPICAL_OUTRO_MS,
  YOUTUBE_API_KEY_STORAGE,
} from './search.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('parseIsoDurationMs', () => {
  it('parses YouTube Data API ISO 8601 durations', () => {
    expect(parseIsoDurationMs('PT4M21S')).toBe(261_000)
    expect(parseIsoDurationMs('PT261S')).toBe(261_000)
    expect(parseIsoDurationMs('PT1H2M3S')).toBe(((1 * 3600) + (2 * 60) + 3) * 1000)
    expect(parseIsoDurationMs('nope')).toBeUndefined()
  })
})

describe('referenceDurationMs', () => {
  it('prefers the original video, then local audio, then chart length plus outro', () => {
    expect(referenceDurationMs({ originalVideoMs: 261_000, localAudioMs: 200_000, lastNoteMs: 240_000 })).toBe(
      261_000,
    )
    expect(referenceDurationMs({ localAudioMs: 248_000, lastNoteMs: 240_000 })).toBe(248_000)
    expect(referenceDurationMs({ lastNoteMs: 240_000 })).toBe(240_000 + TYPICAL_OUTRO_MS)
    expect(chartDurationMs(240_000)).toBe(246_000)
    expect(referenceDurationMs({})).toBeUndefined()
  })
})

describe('autoSelectInstrumental', () => {
  const original = 261_000
  const close = { id: 'close___001', title: 'Song (Instrumental)', durationMs: 261_400 }
  const far = { id: 'far_____002', title: 'Song live', durationMs: 301_000 }
  const mid = { id: 'mid_____003', title: 'Song karaoke', durationMs: 268_000 }

  it('auto-selects the closest candidate when it is within 1 s', () => {
    const result = autoSelectInstrumental(original, [far, mid, close])
    expect(result.ranked[0]?.id).toBe('close___001')
    expect(result.selected?.id).toBe('close___001')
    expect(result.comparison?.sameLength).toBe(true)
    expect(compareDurations(original, close.durationMs).sameLength).toBe(true)
  })

  it('does not auto-select when every candidate is off by more than 1 s', () => {
    const result = autoSelectInstrumental(original, [far, mid])
    expect(result.selected).toBeUndefined()
    expect(result.ranked[0]?.id).toBe('mid_____003')
    expect(result.comparison?.sameLength).toBe(false)
    expect(result.comparison?.absDiffMs).toBe(7000)
  })
})

describe('searchInstrumentals (mocked providers)', () => {
  it('uses the YouTube Data API when a key is provided', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      const url = String(input)
      if (url.includes('/search?')) {
        return jsonResponse({
          items: [
            { id: { videoId: 'close___001' }, snippet: { title: 'Song Instrumental', channelTitle: 'Ch' } },
            { id: { videoId: 'far_____002' }, snippet: { title: 'Song Live', channelTitle: 'Ch' } },
          ],
        })
      }
      if (url.includes('/videos?')) {
        return jsonResponse({
          items: [
            { id: 'close___001', snippet: { title: 'Song Instrumental' }, contentDetails: { duration: 'PT4M21S' } },
            { id: 'far_____002', snippet: { title: 'Song Live' }, contentDetails: { duration: 'PT5M1S' } },
          ],
        })
      }
      throw new Error(`unexpected ${url}`)
    })
    const result = await searchInstrumentals('Artist', 'Song', { apiKey: 'AIzaSyTestKey11', fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.provider).toBe('youtube-data')
    expect(result.query).toBe('Artist Song instrumental')
    expect(result.attempts.some((item) => item.provider === 'youtube-data' && item.status === 'found')).toBe(true)
    expect(result.candidates.map((item) => item.id)).toEqual(['close___001', 'far_____002'])
    expect(result.candidates[0]?.durationMs).toBe(261_000)
    const picked = autoSelectInstrumental(261_000, result.candidates)
    expect(picked.selected?.id).toBe('close___001')
  })

  it('falls back to Invidious when no API key is set, skipping a failing instance', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      const url = String(input)
      if (url.startsWith('https://down.example/')) {
        return new Response('nope', { status: 502 })
      }
      if (url.includes('/api/v1/search')) {
        return jsonResponse([
          { type: 'video', videoId: 'invId____01', title: 'Karaoke', lengthSeconds: 248, author: 'K' },
          { type: 'playlist', playlistId: 'PLxxx', title: 'ignore me' },
        ])
      }
      throw new Error(`unexpected ${url}`)
    })
    const result = await searchInstrumentals('Michael Jackson', 'Human Nature', {
      fetchImpl,
      invidious: ['https://down.example', 'https://inv.ok.test'],
      piped: [],
      timeoutMs: 500,
    })
    expect(result.provider).toBe('invidious')
    expect(result.candidates).toEqual([
      { id: 'invId____01', title: 'Karaoke', durationMs: 248_000, author: 'K' },
    ])
  })

  it('falls back to Piped after Invidious fails, then reports failure if every provider fails', async () => {
    const pipedFetch = vi.fn(async (input: string) => {
      const url = String(input)
      if (url.includes('/api/v1/search')) return new Response('down', { status: 503 })
      if (url.includes('/search?')) {
        return jsonResponse({
          items: [
            { type: 'stream', url: '/watch?v=pipedId__01', title: 'Instrumental', duration: 238, uploaderName: 'P' },
          ],
        })
      }
      throw new Error(`unexpected ${url}`)
    })
    const piped = await searchInstrumentals('Whitney Houston', 'Saving All My Love For You', {
      fetchImpl: pipedFetch,
      invidious: ['https://inv.down.test'],
      piped: ['https://piped.ok.test'],
      timeoutMs: 500,
    })
    expect(piped.provider).toBe('piped')
    expect(piped.candidates[0]?.id).toBe('pipedId__01')
    expect(piped.candidates[0]?.durationMs).toBe(238_000)

    const failed = await searchInstrumentals('A', 'B', {
      fetchImpl: async () => new Response('nope', { status: 500 }),
      invidious: ['https://inv.down.test'],
      piped: ['https://piped.down.test'],
      timeoutMs: 200,
    })
    expect(failed.ok).toBe(false)
    expect(failed.candidates).toEqual([])
    expect(failed.attempts.some((item) => item.status === 'failed')).toBe(true)
    expect(failed.error).toMatch(/Instrumental search failed/)
  })
})

describe('fetchVideoDurationMs (mocked)', () => {
  it('reads lengthSeconds from Invidious', async () => {
    const ms = await fetchVideoDurationMs('origId___01', {
      fetchImpl: async () => jsonResponse({ lengthSeconds: 262 }),
      invidious: ['https://inv.ok.test'],
      piped: [],
    })
    expect(ms).toBe(262_000)
  })
})

describe('YouTube API key persistence', () => {
  it('stores and clears a key in the provided storage', () => {
    const data: Record<string, string> = {}
    const storage = {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value
      },
      removeItem: (key: string) => {
        delete data[key]
      },
    }
    persistYoutubeApiKey('  AIzaSyTestKey11  ', storage)
    expect(readYoutubeApiKey(storage)).toBe('AIzaSyTestKey11')
    expect(data[YOUTUBE_API_KEY_STORAGE]).toBe('AIzaSyTestKey11')
    persistYoutubeApiKey('', storage)
    expect(readYoutubeApiKey(storage)).toBeUndefined()
  })
})
