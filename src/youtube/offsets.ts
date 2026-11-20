export const YT_OFFSET_STORAGE_KEY = 'ghostnote-yt-offset'

export type OffsetStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function songOffsetKey(input: { videoId: string; title: string; artist: string }): string {
  return `${input.videoId}::${input.artist}::${input.title}`
}

export function readOffsetMap(storage?: OffsetStore): Record<string, number> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(YT_OFFSET_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value)
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Read a saved offset. When no value is stored, default is 0 — the usual case
 * for a YouTube id that came from the chart's `#VIDEO` header, because `#GAP`
 * is already timed for that id.
 */
export function readSongOffset(key: string, storage?: OffsetStore, fallback = 0): number {
  const map = readOffsetMap(storage)
  const stored = map[key]
  return stored === undefined ? fallback : stored
}

export function persistSongOffset(key: string, offsetMs: number, storage?: OffsetStore) {
  if (!storage) return
  try {
    const map = readOffsetMap(storage)
    map[key] = Math.round(offsetMs)
    storage.setItem(YT_OFFSET_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clampOffsetMs(value: number, min = -10_000, max = 10_000): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(min, Math.round(value)))
}
