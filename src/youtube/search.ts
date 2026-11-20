/**
 * Auto-find a karaoke/instrumental YouTube video whose length matches the
 * original, for any song the user loads. GhostNote is a static GitHub Pages
 * app, so there is no backend.
 *
 * Lookup order (all keyless except the first):
 *   1. YouTube Data API v3, if the user has pasted an API key (stored only
 *      in localStorage as `ghostnote-youtube-api-key`).
 *   2. Public Piped (then Invidious) instances that have been verified to
 *      allow CORS from the GitHub Pages origin. Hosts that fail CORS in a
 *      real browser are omitted — a server-side curl is not enough.
 * Each instance is tried with a short timeout; a failure moves on.
 *
 * If every provider fails, the UI falls back to the original #VIDEO id
 * (never start silently), plus “Find on YouTube” and a paste-URL field.
 */

import {
  compareDurations,
  DURATION_MATCH_TOLERANCE_MS,
  pickClosestDuration,
  type DurationComparison,
} from './duration.ts'
import { instrumentalSearchQuery } from './instrumentals.ts'

export const YOUTUBE_API_KEY_STORAGE = 'ghostnote-youtube-api-key'

/** Used when the chart has no #VIDEO id and no local audio duration. */
export const TYPICAL_OUTRO_MS = 6000

export const SEARCH_TIMEOUT_MS = 4500

/**
 * Invidious hosts checked from headless Chromium on the live Pages origin
 * (2026-11-20) all failed CORS or timed out. Kept empty so we do not stall
 * the search. Tests may inject instances.
 */
export const INVIDIOUS_INSTANCES: readonly string[] = []

/**
 * Piped hosts verified to allow CORS from https://ilias-el-jaafari.github.io
 * in a real Chromium session. Other public instances failed with
 * “Failed to fetch” (CORS / blocked) or timed out.
 */
export const PIPED_INSTANCES = ['https://api.piped.private.coffee'] as const

export type SearchProvider = 'youtube-data' | 'invidious' | 'piped' | 'mock'

export type ProviderAttemptStatus = 'searching' | 'found' | 'failed'

export type ProviderAttempt = {
  provider: SearchProvider
  instance?: string
  status: ProviderAttemptStatus
  detail?: string
}

export type SearchCandidate = {
  id: string
  title: string
  durationMs: number
  author?: string
}

export type InstrumentalSearchResult = {
  candidates: SearchCandidate[]
  provider: SearchProvider | undefined
  query: string
  attempts: ProviderAttempt[]
  ok: boolean
  error?: string
}

export type AutoSelectResult = {
  ranked: SearchCandidate[]
  selected: SearchCandidate | undefined
  comparison: DurationComparison | undefined
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function chartDurationMs(lastNoteMs: number, outroMs = TYPICAL_OUTRO_MS): number {
  if (!(lastNoteMs >= 0) || !Number.isFinite(lastNoteMs)) return 0
  return Math.round(lastNoteMs + outroMs)
}

/** Reference length: original YouTube video, else local audio, else chart + outro. */
export function referenceDurationMs(input: {
  originalVideoMs?: number
  localAudioMs?: number
  lastNoteMs?: number
}): number | undefined {
  if (input.originalVideoMs && input.originalVideoMs > 0) return Math.round(input.originalVideoMs)
  if (input.localAudioMs && input.localAudioMs > 0) return Math.round(input.localAudioMs)
  if (input.lastNoteMs !== undefined && input.lastNoteMs >= 0) return chartDurationMs(input.lastNoteMs)
  return undefined
}

export function parseIsoDurationMs(value: string): number | undefined {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?$/i.exec(value.trim())
  if (!match) return undefined
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000)
}

export function readYoutubeApiKey(storage?: { getItem: (key: string) => string | null }): string | undefined {
  if (!storage) return undefined
  const value = storage.getItem(YOUTUBE_API_KEY_STORAGE)?.trim()
  return value ? value : undefined
}

export function persistYoutubeApiKey(
  key: string | undefined,
  storage?: { setItem: (key: string, value: string) => void; removeItem?: (key: string) => void },
) {
  if (!storage) return
  const trimmed = key?.trim() ?? ''
  if (!trimmed) {
    storage.removeItem?.(YOUTUBE_API_KEY_STORAGE)
    if (!storage.removeItem) storage.setItem(YOUTUBE_API_KEY_STORAGE, '')
    return
  }
  storage.setItem(YOUTUBE_API_KEY_STORAGE, trimmed)
}

export function autoSelectInstrumental(
  originalMs: number,
  candidates: readonly SearchCandidate[],
  toleranceMs = DURATION_MATCH_TOLERANCE_MS,
): AutoSelectResult {
  const usable = candidates.filter((item) => item.durationMs > 0)
  const ranked = [...usable].sort(
    (a, b) => Math.abs(a.durationMs - originalMs) - Math.abs(b.durationMs - originalMs),
  )
  const closest = pickClosestDuration(originalMs, ranked)
  if (!closest || !(originalMs > 0)) {
    return { ranked, selected: undefined, comparison: undefined }
  }
  const comparison = compareDurations(originalMs, closest.durationMs, toleranceMs)
  return {
    ranked,
    selected: comparison.sameLength ? closest : undefined,
    comparison,
  }
}

function youtubeIdFromPath(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = /(?:v=|\/watch\/|\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/.exec(url)
  return match?.[1]
}

async function fetchJson(url: string, fetchImpl: FetchLike, signal: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function firstSuccess<T>(
  bases: readonly string[],
  run: (base: string, signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<{ value: T; base: string }> {
  let lastError: Error | undefined
  for (const base of bases) {
    if (parent?.aborted) throw new DOMException('Aborted', 'AbortError')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onParentAbort = () => controller.abort()
    parent?.addEventListener('abort', onParentAbort)
    try {
      const value = await run(base.replace(/\/$/, ''), controller.signal)
      return { value, base }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    } finally {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParentAbort)
    }
  }
  throw lastError ?? new Error('All providers failed')
}

function asCandidates(
  items: Array<{ id?: string; title?: string; durationMs?: number; author?: string }>,
): SearchCandidate[] {
  const out: SearchCandidate[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const id = item.id
    const durationMs = item.durationMs ?? 0
    if (!id || seen.has(id) || durationMs <= 0) continue
    seen.add(id)
    out.push({
      id,
      title: item.title?.trim() || id,
      durationMs,
      author: item.author,
    })
  }
  return out
}

async function searchWithYoutubeData(
  query: string,
  apiKey: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<SearchCandidate[]> {
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10` +
    `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`
  const searchJson = (await fetchJson(searchUrl, fetchImpl, signal)) as {
    items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }>
  }
  const ids = (searchJson.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []
  const detailsUrl =
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet` +
    `&id=${ids.map(encodeURIComponent).join(',')}&key=${encodeURIComponent(apiKey)}`
  const details = (await fetchJson(detailsUrl, fetchImpl, signal)) as {
    items?: Array<{
      id?: string
      snippet?: { title?: string; channelTitle?: string }
      contentDetails?: { duration?: string }
    }>
  }
  return asCandidates(
    (details.items ?? []).map((item) => ({
      id: item.id,
      title: item.snippet?.title,
      author: item.snippet?.channelTitle,
      durationMs: item.contentDetails?.duration ? parseIsoDurationMs(item.contentDetails.duration) : undefined,
    })),
  )
}

function parseInvidiousSearch(json: unknown): SearchCandidate[] {
  const rows = Array.isArray(json) ? json : []
  return asCandidates(
    rows.map((row) => {
      const item = row as { type?: string; videoId?: string; title?: string; lengthSeconds?: number; author?: string }
      if (item.type && item.type !== 'video') return {}
      return {
        id: item.videoId,
        title: item.title,
        author: item.author,
        durationMs: typeof item.lengthSeconds === 'number' ? item.lengthSeconds * 1000 : undefined,
      }
    }),
  )
}

function parsePipedSearch(json: unknown): SearchCandidate[] {
  const root = json as { items?: unknown[] }
  const rows = Array.isArray(json) ? json : Array.isArray(root.items) ? root.items : []
  return asCandidates(
    rows.map((row) => {
      const item = row as { type?: string; url?: string; title?: string; duration?: number; uploaderName?: string }
      if (item.type && item.type !== 'stream' && item.type !== 'video') return {}
      return {
        id: youtubeIdFromPath(item.url),
        title: item.title,
        author: item.uploaderName,
        durationMs: typeof item.duration === 'number' ? item.duration * 1000 : undefined,
      }
    }),
  )
}

export async function fetchVideoDurationMs(
  videoId: string,
  options: {
    apiKey?: string
    fetchImpl?: FetchLike
    signal?: AbortSignal
    timeoutMs?: number
    invidious?: readonly string[]
    piped?: readonly string[]
  } = {},
): Promise<number | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS
  const signal = options.signal

  if (options.apiKey) {
    try {
      const url =
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails` +
        `&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(options.apiKey)}`
      const json = (await fetchJson(url, fetchImpl, signal ?? new AbortController().signal)) as {
        items?: Array<{ contentDetails?: { duration?: string } }>
      }
      const iso = json.items?.[0]?.contentDetails?.duration
      const ms = iso ? parseIsoDurationMs(iso) : undefined
      if (ms && ms > 0) return ms
    } catch {
      // Fall through to public instances.
    }
  }

  try {
    const { value } = await firstSuccess(
      options.invidious ?? INVIDIOUS_INSTANCES,
      async (base, instSignal) => {
        const json = (await fetchJson(`${base}/api/v1/videos/${encodeURIComponent(videoId)}`, fetchImpl, instSignal)) as {
          lengthSeconds?: number
        }
        const ms = typeof json.lengthSeconds === 'number' ? json.lengthSeconds * 1000 : 0
        if (!(ms > 0)) throw new Error('no duration')
        return ms
      },
      timeoutMs,
      signal,
    )
    return value
  } catch {
    // Try Piped.
  }

  try {
    const { value } = await firstSuccess(
      options.piped ?? PIPED_INSTANCES,
      async (base, instSignal) => {
        const json = (await fetchJson(`${base}/streams/${encodeURIComponent(videoId)}`, fetchImpl, instSignal)) as {
          duration?: number
        }
        const ms = typeof json.duration === 'number' ? json.duration * 1000 : 0
        if (!(ms > 0)) throw new Error('no duration')
        return ms
      },
      timeoutMs,
      signal,
    )
    return value
  } catch {
    return undefined
  }
}

export type SearchOptions = {
  apiKey?: string
  fetchImpl?: FetchLike
  signal?: AbortSignal
  timeoutMs?: number
  invidious?: readonly string[]
  piped?: readonly string[]
  mockCandidates?: SearchCandidate[]
}

export async function searchInstrumentals(
  artist: string,
  title: string,
  options: SearchOptions = {},
): Promise<InstrumentalSearchResult> {
  const query = instrumentalSearchQuery(artist, title)
  const attempts: ProviderAttempt[] = []
  if (options.mockCandidates) {
    attempts.push({ provider: 'mock', status: 'found', detail: `${options.mockCandidates.length} candidates` })
    return { candidates: options.mockCandidates, provider: 'mock', query, attempts, ok: true }
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS

  if (options.apiKey) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs * 2)
      const onParent = () => controller.abort()
      options.signal?.addEventListener('abort', onParent)
      try {
        const candidates = await searchWithYoutubeData(query, options.apiKey, fetchImpl, controller.signal)
        if (candidates.length > 0) {
          attempts.push({ provider: 'youtube-data', status: 'found', detail: `${candidates.length} candidates` })
          return { candidates, provider: 'youtube-data', query, attempts, ok: true }
        }
        attempts.push({ provider: 'youtube-data', status: 'failed', detail: 'empty result' })
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onParent)
      }
    } catch (error) {
      attempts.push({
        provider: 'youtube-data',
        status: 'failed',
        detail: error instanceof Error ? error.message : 'youtube-data failed',
      })
    }
  }

  const invidious = options.invidious ?? INVIDIOUS_INSTANCES
  if (invidious.length > 0) {
    try {
      const { value, base } = await firstSuccess(
        invidious,
        async (base, signal) => {
          const json = await fetchJson(
            `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
            fetchImpl,
            signal,
          )
          const candidates = parseInvidiousSearch(json)
          if (candidates.length === 0) throw new Error('empty invidious result')
          return candidates
        },
        timeoutMs,
        options.signal,
      )
      attempts.push({ provider: 'invidious', instance: base, status: 'found', detail: `${value.length} candidates` })
      return { candidates: value, provider: 'invidious', query, attempts, ok: true }
    } catch (error) {
      attempts.push({
        provider: 'invidious',
        status: 'failed',
        detail: error instanceof Error ? error.message : 'invidious failed',
      })
    }
  }

  const piped = options.piped ?? PIPED_INSTANCES
  if (piped.length > 0) {
    try {
      const { value, base } = await firstSuccess(
        piped,
        async (base, signal) => {
          const json = await fetchJson(
            `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
            fetchImpl,
            signal,
          )
          const candidates = parsePipedSearch(json)
          if (candidates.length === 0) throw new Error('empty piped result')
          return candidates
        },
        timeoutMs,
        options.signal,
      )
      attempts.push({ provider: 'piped', instance: base, status: 'found', detail: `${value.length} candidates` })
      return { candidates: value, provider: 'piped', query, attempts, ok: true }
    } catch (error) {
      attempts.push({
        provider: 'piped',
        status: 'failed',
        detail: error instanceof Error ? error.message : 'piped failed',
      })
    }
  }

  const error = `Instrumental search failed (${attempts.map((item) => item.detail).filter(Boolean).join('; ') || 'no providers'})`
  return { candidates: [], provider: undefined, query, attempts, ok: false, error }
}
