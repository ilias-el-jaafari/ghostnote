import { isYouTubeId, parseYouTubeUrl } from './ids.ts'

export const INSTRUMENTAL_STORAGE_KEY = 'ghostnote-instrumentals'
export const SOURCE_STORAGE_KEY = 'ghostnote-audio-source'

export type AudioSourceKind = 'original' | 'instrumental'

export type InstrumentalStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function normalizePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Stable key for a chart, independent of the local file name or folder. */
export function songIdentityKey(artist: string, title: string): string {
  return `${normalizePart(artist)}::${normalizePart(title)}`
}

export function instrumentalSearchQuery(artist: string, title: string): string {
  return `${artist} ${title} karaoke instrumental`.replace(/\s+/g, ' ').trim()
}

export function instrumentalSearchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    instrumentalSearchQuery(artist, title),
  )}`
}

export function parseYouTubeIds(input: string): string[] {
  const parts = input.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const id = parseYouTubeUrl(part) ?? (isYouTubeId(part) ? part : undefined)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  // Also catch ids embedded in messy pasted text that did not split cleanly.
  if (ids.length === 0) {
    const loose = input.match(/[A-Za-z0-9_-]{11}/g) ?? []
    for (const token of loose) {
      const id = parseYouTubeUrl(token)
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

function readStringMap(storage: InstrumentalStore | undefined, key: string): Record<string, string> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [entry, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[entry] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeStringMap(
  storage: InstrumentalStore | undefined,
  key: string,
  map: Record<string, string>,
) {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(map))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function readInstrumentalId(songKey: string, storage?: InstrumentalStore): string | undefined {
  const id = readStringMap(storage, INSTRUMENTAL_STORAGE_KEY)[songKey]
  return id && isYouTubeId(id) ? id : undefined
}

export function persistInstrumentalId(
  songKey: string,
  videoId: string | undefined,
  storage?: InstrumentalStore,
) {
  if (!storage) return
  const map = readStringMap(storage, INSTRUMENTAL_STORAGE_KEY)
  if (videoId && isYouTubeId(videoId)) map[songKey] = videoId
  else delete map[songKey]
  writeStringMap(storage, INSTRUMENTAL_STORAGE_KEY, map)
}

export function isAudioSourceKind(value: string | undefined | null): value is AudioSourceKind {
  return value === 'original' || value === 'instrumental'
}

export function readSourcePreference(
  songKey: string,
  storage?: InstrumentalStore,
): AudioSourceKind | undefined {
  const value = readStringMap(storage, SOURCE_STORAGE_KEY)[songKey]
  return isAudioSourceKind(value) ? value : undefined
}

export function persistSourcePreference(
  songKey: string,
  source: AudioSourceKind,
  storage?: InstrumentalStore,
) {
  if (!storage) return
  const map = readStringMap(storage, SOURCE_STORAGE_KEY)
  map[songKey] = source
  writeStringMap(storage, SOURCE_STORAGE_KEY, map)
}

/**
 * Default source for a song: honour a saved choice, otherwise prefer an
 * already-picked instrumental, otherwise instrumental when there is no local
 * audio file (typical USDB chart), otherwise the original file.
 */
export function defaultSource(input: {
  saved?: AudioSourceKind
  instrumentalId?: string
  hasLocalAudio: boolean
}): AudioSourceKind {
  if (input.saved) return input.saved
  if (input.instrumentalId) return 'instrumental'
  if (!input.hasLocalAudio) return 'instrumental'
  return 'original'
}
