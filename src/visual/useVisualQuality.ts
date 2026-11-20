import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  chooseVisualQuality,
  detectWebGL,
  downgradeQuality,
  readQualityHints,
  settingsFor,
  type QualitySettings,
  type VisualQuality,
} from './quality.ts'

export type VisualQualityState = {
  quality: VisualQuality
  settings: QualitySettings
  webgl: boolean
  fps: number | undefined
  reportFps: (fps: number) => void
  setQuality: (quality: VisualQuality) => void
}

function initialState(): { quality: VisualQuality; webgl: boolean; locked: boolean } {
  if (typeof window === 'undefined') return { quality: 'medium', webgl: false, locked: false }
  const canvas = document.createElement('canvas')
  const webgl = detectWebGL(canvas)
  const hints = readQualityHints({
    hasWebGL: () => webgl,
    matchMedia: (query) => window.matchMedia(query),
    navigator: window.navigator as Navigator & { deviceMemory?: number },
    search: window.location.search,
  })
  return {
    quality: chooseVisualQuality(hints),
    webgl,
    locked: Boolean(hints.override && hints.override !== 'auto'),
  }
}

export function useVisualQuality(): VisualQualityState {
  const boot = useMemo(() => initialState(), [])
  const [quality, setQuality] = useState<VisualQuality>(boot.quality)
  const [fps, setFps] = useState<number | undefined>(undefined)
  const lockedRef = useRef(boot.locked)
  const droppedRef = useRef(false)

  const reportFps = useCallback((next: number) => {
    setFps(next)
    if (lockedRef.current || droppedRef.current) return
    if (next < 28) {
      droppedRef.current = true
      setQuality((current) => downgradeQuality(current))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const current = window.__GHOSTNOTE_VISUAL__
    window.__GHOSTNOTE_VISUAL__ = { fps: fps ?? 0, quality, theme: current?.theme }
  }, [fps, quality])

  const settings = useMemo(() => settingsFor(quality, boot.webgl), [boot.webgl, quality])

  return { quality, settings, webgl: boot.webgl, fps, reportFps, setQuality }
}

declare global {
  interface Window {
    __GHOSTNOTE_VISUAL__?: { fps: number; quality: VisualQuality; theme?: string }
  }
}
