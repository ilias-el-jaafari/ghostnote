import { useEffect, useRef } from 'react'
import { guideFrequencyAt, type SongTimeline } from '../game/index.ts'

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || window.webkitAudioContext
}

/**
 * Play a quiet synthesized guide tone for the current chart note.
 * Used in Phase 2 because demo audio is not shipped yet.
 */
export function useGuideMelody(
  timeline: SongTimeline | undefined,
  timeMs: number,
  enabled: boolean,
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
    oscillator.type = 'triangle'
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
      gain.gain.setTargetAtTime(0.07, now, 0.02)
    } else {
      gain.gain.setTargetAtTime(0, now, 0.03)
    }
  }, [enabled, timeMs, timeline])
}
