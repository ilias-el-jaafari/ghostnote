import { useCallback, useEffect, useRef, useState } from 'react'

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || window.webkitAudioContext
}

export type SongPlayback = {
  analyser: AnalyserNode | undefined
  ready: boolean
  error: string | undefined
  hasSource: boolean
  sync: (timeMs: number, playing: boolean) => void
  currentTimeMs: () => number | undefined
}

/**
 * Play a karaoke backing track and expose an AnalyserNode for the HUD waveform.
 * Song time 0 is the start of the audio file (UltraStar `#GAP` already lives in note times).
 */
export function useSongPlayback(src: string | undefined): SongPlayback {
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined)
  const ctxRef = useRef<AudioContext | undefined>(undefined)
  const [analyser, setAnalyser] = useState<AnalyserNode | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [boundSrc, setBoundSrc] = useState(src)
  if (boundSrc !== src) {
    setBoundSrc(src)
    setReady(false)
    setError(undefined)
    setAnalyser(undefined)
  }

  useEffect(() => {
    if (!src) return

    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    audio.src = src
    audioRef.current = audio

    const Ctor = getAudioContextConstructor()
    let context: AudioContext | undefined
    let node: AnalyserNode | undefined
    if (Ctor) {
      context = new Ctor()
      const source = context.createMediaElementSource(audio)
      node = context.createAnalyser()
      node.fftSize = 1024
      node.smoothingTimeConstant = 0.72
      source.connect(node)
      node.connect(context.destination)
      ctxRef.current = context
    }

    const onReady = () => {
      setReady(true)
      if (node) setAnalyser(node)
    }
    const onError = () => setError('audio-error')
    audio.addEventListener('canplay', onReady)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('canplay', onReady)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      node?.disconnect()
      void context?.close()
      audioRef.current = undefined
      ctxRef.current = undefined
    }
  }, [src])

  const sync = useCallback((timeMs: number, playing: boolean) => {
    const audio = audioRef.current
    if (!audio) return
    if (timeMs < 0) {
      if (!audio.paused) audio.pause()
      if (audio.currentTime > 0.01) audio.currentTime = 0
      return
    }
    const target = timeMs / 1000
    if (Math.abs(audio.currentTime - target) > 0.28) {
      try {
        audio.currentTime = target
      } catch {
        // Some browsers throw if the element is not yet seekable.
      }
    }
    if (playing && audio.paused) {
      void ctxRef.current?.resume()
      void audio.play().catch(() => undefined)
    } else if (!playing && !audio.paused) {
      audio.pause()
    }
  }, [])

  const currentTimeMs = useCallback((): number | undefined => {
    const audio = audioRef.current
    if (!audio || audio.paused || audio.readyState < 2) return undefined
    return audio.currentTime * 1000
  }, [])

  return { analyser, ready, error, hasSource: Boolean(src), sync, currentTimeMs }
}
