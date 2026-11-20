import { useEffect, useRef } from 'react'
import { guideFrequencyAt, type SongTimeline } from '../game/index.ts'
import { DEFAULT_GUIDE_VOLUME } from './mix.ts'

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || window.webkitAudioContext
}

/** A brighter lead than a plain triangle: fundamental plus a few harmonics. */
function brighterGuideWave(context: AudioContext): PeriodicWave | undefined {
  if (typeof context.createPeriodicWave !== 'function') return undefined
  const imag = new Float32Array([0, 1, 0.45, 0.22, 0.1, 0.05])
  const real = new Float32Array(imag.length)
  return context.createPeriodicWave(real, imag)
}

/**
 * Play a synthesized guide tone for the current chart note.
 * Stays on by default; the caller passes a clearly audible gain (and may
 * duck it slightly when a real backing track is already playing).
 */
export function useGuideMelody(
  timeline: SongTimeline | undefined,
  timeMs: number,
  enabled: boolean,
  gainLevel = DEFAULT_GUIDE_VOLUME,
) {
  const ctxRef = useRef<AudioContext | undefined>(undefined)
  const oscRef = useRef<OscillatorNode | undefined>(undefined)
  const gainRef = useRef<GainNode | undefined>(undefined)

  useEffect(() => {
    if (!enabled || !timeline) return
    const Ctor = getAudioContextConstructor()
    if (!Ctor) return

    const context = new Ctor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const wave = brighterGuideWave(context)
    if (wave) oscillator.setPeriodicWave(wave)
    else oscillator.type = 'sawtooth'
    gain.gain.value = 0
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    void context.resume()

    ctxRef.current = context
    oscRef.current = oscillator
    gainRef.current = gain

    return () => {
      try {
        oscillator.stop()
      } catch {
        // Already stopped.
      }
      gain.disconnect()
      void context.close()
      ctxRef.current = undefined
      oscRef.current = undefined
      gainRef.current = undefined
    }
  }, [enabled, timeline])

  useEffect(() => {
    const context = ctxRef.current
    const oscillator = oscRef.current
    const gain = gainRef.current
    if (!context || !oscillator || !gain || !timeline || !enabled) return

    const frequency = guideFrequencyAt(timeline, timeMs)
    const now = context.currentTime
    if (frequency !== undefined) {
      oscillator.frequency.setTargetAtTime(frequency, now, 0.01)
      gain.gain.setTargetAtTime(gainLevel, now, 0.02)
    } else {
      gain.gain.setTargetAtTime(0, now, 0.03)
    }
  }, [enabled, gainLevel, timeMs, timeline])
}
