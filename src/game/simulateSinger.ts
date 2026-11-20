import { midiToFrequency, ultraStarPitchToMidi } from '../pitch/index.ts'
import type { SingerSample } from './scoring.ts'
import { isScorable } from './scoring.ts'
import { noteAt, type SongTimeline } from './timing.ts'

export type SimulatedSingerOptions = {
  /** Uniform noise added to the target pitch, in cents. 0 is a perfect singer. */
  noiseCents?: number
  /** Probability in [0, 1] of dropping a sample entirely. */
  missRate?: number
  rng?: () => number
}

/**
 * Feed the pitch (or rap presence) that the chart expects at `timeMs`.
 * Used for dev-only practice and for headless scoring tests.
 */
export function simulatedSampleAt(
  timeline: SongTimeline,
  timeMs: number,
  options: SimulatedSingerOptions = {},
): SingerSample {
  const rng = options.rng ?? Math.random
  const missRate = options.missRate ?? 0
  if (missRate > 0 && rng() < missRate) {
    return { midi: null, presence: false }
  }

  const note = noteAt(timeline, timeMs)
  if (!note || !isScorable(note.type)) {
    return { midi: null, presence: false }
  }

  if (note.type === 'rap' || note.type === 'goldenRap') {
    return { midi: null, presence: true }
  }

  const targetMidi = ultraStarPitchToMidi(note.pitch)
  const noiseCents = options.noiseCents ?? 0
  const jitter = noiseCents === 0 ? 0 : (rng() * 2 - 1) * noiseCents
  return {
    midi: targetMidi + jitter / 100,
    presence: true,
  }
}

/** Frequency of the expected note, for a guide-tone oscillator. */
export function guideFrequencyAt(
  timeline: SongTimeline,
  timeMs: number,
): number | undefined {
  const note = noteAt(timeline, timeMs)
  if (!note) return undefined
  if (note.type === 'rap' || note.type === 'goldenRap' || note.type === 'freestyle') {
    return undefined
  }
  return midiToFrequency(ultraStarPitchToMidi(note.pitch))
}
