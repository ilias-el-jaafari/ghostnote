import { useEffect, useMemo, useRef, useState } from 'react'
import {
  compareDurations,
  type DurationComparison,
} from './duration.ts'
import {
  persistInstrumentalId,
  songIdentityKey,
} from './instrumentals.ts'
import {
  autoSelectInstrumental,
  fetchVideoDurationMs,
  readYoutubeApiKey,
  referenceDurationMs,
  searchInstrumentals,
  type SearchCandidate,
  type SearchProvider,
} from './search.ts'

export type MatchingStatus = 'idle' | 'searching' | 'ready' | 'failed'

export type MatchingState = {
  status: MatchingStatus
  error: string | undefined
  query: string
  provider: SearchProvider | undefined
  referenceMs: number | undefined
  candidates: SearchCandidate[]
  selected: SearchCandidate | undefined
  comparison: DurationComparison | undefined
  retry: () => void
  choose: (id: string) => void
  applyPasted: (ids: string[]) => Promise<void>
}

function browserStorage() {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

async function loadLocalAudioDuration(url: string, signal: AbortSignal): Promise<number | undefined> {
  if (typeof Audio === 'undefined') return undefined
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    const finish = (ms: number | undefined) => {
      audio.removeAttribute('src')
      audio.load()
      resolve(ms)
    }
    const onAbort = () => finish(undefined)
    signal.addEventListener('abort', onAbort)
    audio.onloadedmetadata = () => {
      const ms = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined
      finish(ms && ms > 0 ? ms : undefined)
    }
    audio.onerror = () => finish(undefined)
    audio.src = url
  })
}

function mockList(title: string, referenceMs: number): SearchCandidate[] {
  return [
    { id: 'mockClose01', title: `${title} (Karaoke Instrumental)`, durationMs: referenceMs },
    { id: 'mockFar__02', title: `${title} (live)`, durationMs: referenceMs + 12_000 },
  ]
}

export function useInstrumentalMatching(options: {
  artist: string
  title: string
  originalYoutubeId?: string
  localAudioUrl?: string
  lastNoteMs: number
  savedInstrumentalId?: string
  mock?: boolean
  enabled?: boolean
  onAutoSelect?: (id: string) => void
}): MatchingState {
  const {
    artist,
    title,
    originalYoutubeId,
    localAudioUrl,
    lastNoteMs,
    savedInstrumentalId,
    mock = false,
    enabled = true,
    onAutoSelect,
  } = options
  const songKey = useMemo(() => songIdentityKey(artist, title), [artist, title])
  const [status, setStatus] = useState<MatchingStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState<SearchProvider | undefined>(undefined)
  const [referenceMs, setReferenceMs] = useState<number | undefined>(undefined)
  const [candidates, setCandidates] = useState<SearchCandidate[]>([])
  const [pickedId, setPickedId] = useState<string | undefined>(undefined)
  const [pickedForKey, setPickedForKey] = useState(songKey)
  const selectedId = pickedForKey === songKey ? (pickedId ?? savedInstrumentalId) : savedInstrumentalId
  const [nonce, setNonce] = useState(0)
  const autoSelectRef = useRef(onAutoSelect)

  useEffect(() => {
    autoSelectRef.current = onAutoSelect
  }, [onAutoSelect])

  useEffect(() => {
    if (!enabled || !artist || !title) return
    const controller = new AbortController()
    const storage = browserStorage()
    const timer = setTimeout(() => {
      void (async () => {
        setStatus('searching')
        setError(undefined)
        try {
          const apiKey = readYoutubeApiKey(storage)
          let originalVideoMs: number | undefined
          if (originalYoutubeId && !mock) {
            originalVideoMs = await fetchVideoDurationMs(originalYoutubeId, {
              apiKey,
              signal: controller.signal,
            })
          }
          let localAudioMs: number | undefined
          if (!originalVideoMs && localAudioUrl) {
            localAudioMs = await loadLocalAudioDuration(localAudioUrl, controller.signal)
          }
          const reference = referenceDurationMs({
            originalVideoMs,
            localAudioMs,
            lastNoteMs,
          })
          if (controller.signal.aborted) return
          setReferenceMs(reference)

          if (savedInstrumentalId && !mock) {
            let durationMs: number | undefined
            durationMs = await fetchVideoDurationMs(savedInstrumentalId, {
              apiKey,
              signal: controller.signal,
            })
            const saved: SearchCandidate = {
              id: savedInstrumentalId,
              title: savedInstrumentalId,
              durationMs: durationMs ?? 0,
            }
            setCandidates([saved])
            setPickedId(savedInstrumentalId)
            setPickedForKey(songKey)
            setProvider(undefined)
            setQuery('')
            setStatus('ready')
            return
          }

          const result = await searchInstrumentals(artist, title, {
            apiKey,
            signal: controller.signal,
            mockCandidates: mock && reference ? mockList(title, reference) : undefined,
          })
          if (controller.signal.aborted) return
          setQuery(result.query)
          setProvider(result.provider)
          setCandidates(result.candidates)
          if (reference) {
            const picked = autoSelectInstrumental(reference, result.candidates)
            if (picked.selected) {
              setPickedId(picked.selected.id)
              setPickedForKey(songKey)
              persistInstrumentalId(songKey, picked.selected.id, storage)
              autoSelectRef.current?.(picked.selected.id)
            }
          }
          setStatus('ready')
        } catch (caught) {
          if (controller.signal.aborted) return
          setCandidates([])
          setStatus('failed')
          setError(caught instanceof Error ? caught.message : 'search failed')
        }
      })()
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    artist,
    title,
    originalYoutubeId,
    localAudioUrl,
    lastNoteMs,
    savedInstrumentalId,
    mock,
    enabled,
    songKey,
    nonce,
  ])

  const selected = useMemo(
    () => candidates.find((item) => item.id === selectedId),
    [candidates, selectedId],
  )
  const comparison = useMemo(() => {
    if (!referenceMs || !selected || !(selected.durationMs > 0)) return undefined
    return compareDurations(referenceMs, selected.durationMs)
  }, [referenceMs, selected])

  function choose(id: string) {
    setPickedId(id)
    setPickedForKey(songKey)
    persistInstrumentalId(songKey, id, browserStorage())
    autoSelectRef.current?.(id)
    if (!candidates.some((item) => item.id === id)) {
      setCandidates((current) => [{ id, title: id, durationMs: 0 }, ...current])
    }
  }

  async function applyPasted(ids: string[]) {
    if (ids.length === 0) return
    const storage = browserStorage()
    const apiKey = readYoutubeApiKey(storage)
    const known = new Map(candidates.map((item) => [item.id, item]))
    const resolved: SearchCandidate[] = []
    for (const id of ids) {
      const existing = known.get(id)
      if (existing && existing.durationMs > 0) {
        resolved.push(existing)
        continue
      }
      const durationMs = mock
        ? (referenceMs ?? 0)
        : ((await fetchVideoDurationMs(id, { apiKey })) ?? 0)
      const item: SearchCandidate = { id, title: existing?.title ?? id, durationMs }
      resolved.push(item)
    }
    setCandidates((current) => {
      const seen = new Set(resolved.map((item) => item.id))
      return [...resolved, ...current.filter((item) => !seen.has(item.id))]
    })
    const picked = referenceMs ? autoSelectInstrumental(referenceMs, resolved) : undefined
    const id = picked?.selected?.id ?? (resolved.length === 1 ? resolved[0]?.id : picked?.ranked[0]?.id)
    if (id) choose(id)
    setStatus('ready')
  }

  return {
    status,
    error,
    query,
    provider,
    referenceMs,
    candidates,
    selected,
    comparison,
    retry: () => setNonce((value) => value + 1),
    choose,
    applyPasted,
  }
}
