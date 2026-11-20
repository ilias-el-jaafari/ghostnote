import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyPlayerPoll,
  mediaTimeAt,
  pollPlayer,
  YT_CUED,
  YT_PAUSED,
  YT_PLAYING,
  YT_UNSTARTED,
  type MediaClockReading,
  type YoutubePlayerLike,
  type YoutubeClockSnapshot,
} from './clock.ts'

export const YOUTUBE_MIN_SIZE = 200

export type YouTubePlayerController = {
  hostRef: { current: HTMLDivElement | null }
  ready: boolean
  state: number
  durationMs: number
  title: string
  needsTap: boolean
  mock: boolean
  readClock: () => MediaClockReading | undefined
  play: () => Promise<void>
  pause: () => void
  toggle: () => Promise<void>
  seekToMs: (timeMs: number) => void
  isRunning: () => boolean
}

type YtPlayerCtor = new (
  element: HTMLElement | string,
  options: Record<string, unknown>,
) => YoutubePlayerLike & {
  getVideoData?: () => { title?: string }
  destroy?: () => void
}

declare global {
  interface Window {
    YT?: { Player: YtPlayerCtor; PlayerState?: Record<string, number> }
    onYouTubeIframeAPIReady?: () => void
  }
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'))
  if (window.YT?.Player) return Promise.resolve()
  const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
  return new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve()
      else reject(new Error('YouTube IFrame API failed to load'))
    }
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => reject(new Error('YouTube IFrame API failed to load'))
      document.head.appendChild(script)
    }
    if (window.YT?.Player) resolve()
  })
}

class MockYoutubePlayer implements YoutubePlayerLike {
  private mediaSeconds = 0
  private startedAt: number | undefined
  state = YT_CUED
  duration = 30
  title = 'GhostNote preview'

  getCurrentTime(): number {
    if (this.state === YT_PLAYING && this.startedAt !== undefined) {
      return this.mediaSeconds + (performance.now() - this.startedAt) / 1000
    }
    return this.mediaSeconds
  }

  getPlayerState(): number {
    return this.state
  }

  getDuration(): number {
    return this.duration
  }

  getVideoData() {
    return { title: this.title }
  }

  playVideo() {
    if (this.state !== YT_PLAYING) {
      this.startedAt = performance.now()
      this.state = YT_PLAYING
    }
  }

  pauseVideo() {
    this.mediaSeconds = this.getCurrentTime()
    this.startedAt = undefined
    this.state = YT_PAUSED
  }

  seekTo(seconds: number, _allowSeekAhead: boolean) {
    this.mediaSeconds = Math.max(0, seconds)
    if (this.state === YT_PLAYING) this.startedAt = performance.now()
  }

  destroy() {
    this.startedAt = undefined
    this.state = YT_UNSTARTED
  }
}

export function useYouTubePlayer(options: {
  videoId: string | undefined
  mock?: boolean
  offsetMs: number
  enabled?: boolean
  /** Seek here once the player is ready (screenshot / &t= flags). */
  startMs?: number
}): YouTubePlayerController {
  const { videoId, mock = false, offsetMs, enabled = true, startMs } = options
  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<(YoutubePlayerLike & { destroy?: () => void }) | undefined>(undefined)
  const snapRef = useRef<YoutubeClockSnapshot | undefined>(undefined)
  const offsetRef = useRef(offsetMs)
  const seekingRef = useRef(false)
  const [ready, setReady] = useState(() => Boolean(mock && enabled && (videoId || mock)))
  const [state, setState] = useState(() => (mock ? YT_CUED : YT_UNSTARTED))
  const [durationMs, setDurationMs] = useState(() => (mock ? 30_000 : 0))
  const [title, setTitle] = useState(() => (mock ? 'GhostNote preview' : ''))
  const [needsTap, setNeedsTap] = useState(false)

  useEffect(() => {
    offsetRef.current = offsetMs
  }, [offsetMs])

  useEffect(() => {
    if (!enabled || (!videoId && !mock)) return
    const host = hostRef.current
    let cancelled = false
    let player: (YoutubePlayerLike & { destroy?: () => void }) | undefined

    const attach = (next: YoutubePlayerLike & { destroy?: () => void; getVideoData?: () => { title?: string }; getDuration?: () => number }) => {
      if (cancelled) {
        next.destroy?.()
        return
      }
      player = next
      playerRef.current = next
      setReady(true)
      setState(next.getPlayerState())
      const duration = next.getDuration?.() ?? 0
      setDurationMs(duration > 0 ? duration * 1000 : 0)
      const videoTitle = next.getVideoData?.().title
      if (videoTitle) setTitle(videoTitle)
      if (startMs && startMs > 0) next.seekTo?.(startMs / 1000, true)
    }

    if (mock) {
      const next = new MockYoutubePlayer()
      if (startMs && startMs > 0) next.seekTo(startMs / 1000, true)
      player = next
      playerRef.current = next
      return () => {
        cancelled = true
        player?.destroy?.()
        playerRef.current = undefined
        snapRef.current = undefined
      }
    }

    if (!videoId || !host) return

    void loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player || !hostRef.current) return
        const ctor = window.YT.Player
        const created = new ctor(hostRef.current, {
          width: YOUTUBE_MIN_SIZE,
          height: YOUTUBE_MIN_SIZE,
          videoId,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
            fs: 1,
            controls: 1,
          },
          events: {
            onReady: (event: { target: YoutubePlayerLike & { getVideoData?: () => { title?: string }; getDuration?: () => number } }) => {
              attach(event.target)
            },
            onStateChange: (event: { data: number }) => {
              setState(event.data)
              seekingRef.current = false
              const current = playerRef.current
              const duration = current?.getDuration?.() ?? 0
              if (duration > 0) setDurationMs(duration * 1000)
              const videoTitle = current && 'getVideoData' in current
                ? (current as { getVideoData?: () => { title?: string } }).getVideoData?.().title
                : undefined
              if (videoTitle) setTitle(videoTitle)
            },
            onError: () => {
              setNeedsTap(true)
            },
          },
        })
        player = created
      })
      .catch(() => {
        if (!cancelled) setNeedsTap(true)
      })

    return () => {
      cancelled = true
      player?.destroy?.()
      playerRef.current = undefined
      snapRef.current = undefined
      setReady(false)
    }
  }, [enabled, mock, startMs, videoId])

  const readClock = useCallback((): MediaClockReading | undefined => {
    const player = playerRef.current
    if (!player) return undefined
    const poll = pollPlayer(player, performance.now(), offsetRef.current, {
      seeking: seekingRef.current,
    })
    snapRef.current = applyPlayerPoll(snapRef.current, poll)
    return mediaTimeAt(snapRef.current, performance.now())
  }, [])

  const play = useCallback(async () => {
    const player = playerRef.current
    if (!player?.playVideo) {
      setNeedsTap(true)
      return
    }
    try {
      const result = player.playVideo() as unknown
      if (result && typeof result === 'object' && 'then' in result) {
        await (result as Promise<void>)
      }
      setNeedsTap(false)
    } catch {
      setNeedsTap(true)
    }
  }, [])

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo?.()
  }, [])

  const isRunning = useCallback(() => {
    return playerRef.current?.getPlayerState() === YT_PLAYING
  }, [])

  const toggle = useCallback(async () => {
    if (isRunning()) pause()
    else await play()
  }, [isRunning, pause, play])

  const seekToMs = useCallback((timeMs: number) => {
    const player = playerRef.current
    if (!player?.seekTo) return
    seekingRef.current = true
    const mediaMs = Math.max(0, timeMs - offsetRef.current)
    player.seekTo(mediaMs / 1000, true)
  }, [])

  return useMemo(
    () => ({
      hostRef,
      ready,
      state,
      durationMs,
      title,
      needsTap,
      mock,
      readClock,
      play,
      pause,
      toggle,
      seekToMs,
      isRunning,
    }),
    [
      ready,
      state,
      durationMs,
      title,
      needsTap,
      mock,
      readClock,
      play,
      pause,
      toggle,
      seekToMs,
      isRunning,
    ],
  )
}
