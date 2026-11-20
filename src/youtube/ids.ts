/**
 * Extract a YouTube video id from a URL, a pasted value, or an UltraStar
 * `#VIDEO` header. USDB stores a comma-separated key=value list where `v=` is
 * a video id and `a=` is an audio-only YouTube id.
 */

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export type YouTubeSourceKind = 'video' | 'audio'

export type YouTubeSource = {
  id: string
  kind: YouTubeSourceKind
}

const ID_IN_LIST = /(?:^|,)([va])=([A-Za-z0-9_-]{11})(?=,|$)/gi

export function isYouTubeId(value: string | undefined | null): value is string {
  return Boolean(value && YOUTUBE_ID_PATTERN.test(value))
}

/** Pull an 11-character id out of a watch/embed/shorts/youtu.be URL. */
export function parseYouTubeUrl(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  if (isYouTubeId(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    try {
      url = new URL(`https://${trimmed}`)
    } catch {
      return undefined
    }
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '')
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v && isYouTubeId(v)) return v
    const parts = url.pathname.split('/').filter(Boolean)
    const first = parts[0]
    const second = parts[1]
    if (first && isYouTubeId(first)) return first
    if (
      second &&
      isYouTubeId(second) &&
      (first === 'embed' || first === 'shorts' || first === 'live' || first === 'v')
    ) {
      return second
    }
  }
  return undefined
}

/**
 * Parse a `#VIDEO` (or similar) header value.
 * Handles local file names, bare ids, URLs, `v=…`, and USDB lists such as
 * `v=abcdefghijk,co=cover.jpg,bg=bg.jpg` or `a=abcdefghijk,co=…`.
 * `v=` wins over `a=` if both are present.
 */
export function parseYouTubeHeaderSource(
  value: string | undefined | null,
): YouTubeSource | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const fromUrl = parseYouTubeUrl(trimmed)
  if (fromUrl) return { id: fromUrl, kind: 'video' }

  let video: string | undefined
  let audio: string | undefined
  ID_IN_LIST.lastIndex = 0
  let match: RegExpExecArray | null = ID_IN_LIST.exec(trimmed)
  while (match) {
    const kind = match[1]
    const id = match[2]
    if (kind === 'v' && id) video = id
    if (kind === 'a' && id) audio = id
    match = ID_IN_LIST.exec(trimmed)
  }
  if (video) return { id: video, kind: 'video' }
  if (audio) return { id: audio, kind: 'audio' }
  return undefined
}

export function parseYouTubeHeader(value: string | undefined | null): string | undefined {
  return parseYouTubeHeaderSource(value)?.id
}

export function youtubeSourceFromRawHeaders(
  raw: Record<string, string> | undefined,
): YouTubeSource | undefined {
  if (!raw) return undefined
  const fromVideo = parseYouTubeHeaderSource(raw.VIDEO)
  if (fromVideo) return fromVideo
  for (const key of ['YOUTUBE', 'VIDEOURL', 'YT'] as const) {
    const id = parseYouTubeUrl(raw[key] ?? '')
    if (id) return { id, kind: 'video' }
  }
  return undefined
}

export function youtubeIdFromRawHeaders(
  raw: Record<string, string> | undefined,
): string | undefined {
  return youtubeSourceFromRawHeaders(raw)?.id
}
