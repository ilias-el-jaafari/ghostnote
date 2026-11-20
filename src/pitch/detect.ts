import { detectPitchMpm } from './mpm.ts'
import {
  detectPitchYin,
  type PitchDetectionResult,
  type PitchDetectorOptions,
} from './yin.ts'

export type PitchCandidate = {
  frequency: number
  score: number
  source: 'yin' | 'mpm'
}

export type CombinedPitchResult = PitchDetectionResult & {
  candidates: PitchCandidate[]
  rawFrequency: number
}

const NEAR_RATIO = 0.06
/** A lower-octave peak must be at least this fraction of the apparent peak. */
const SCORE_RATIO_FOR_LOWER = 0.5
/**
 * Equally strong peaks at T, 2T, 3T… are subharmonics of a clean period
 * (pure sine or very periodic vowel). Only drop to a lower octave when the
 * lower peak is clearly *weaker* than the apparent period — a weak F0 under
 * a strong overtone.
 */
const EQUAL_SCORE_DELTA = 0.08
const KEY_MAX_RATIO = 0.9

export function isNearMultiple(higherHz: number, lowerHz: number): boolean {
  if (!(higherHz > 0) || !(lowerHz > 0) || higherHz <= lowerHz) return false
  const ratio = higherHz / lowerHz
  return [2, 3, 4].some((factor) => Math.abs(ratio / factor - 1) < NEAR_RATIO)
}

export function isNearOctaveBelow(higherHz: number, lowerHz: number): boolean {
  if (!(higherHz > 0) || !(lowerHz > 0) || higherHz <= lowerHz) return false
  const ratio = higherHz / lowerHz
  return [2, 4].some((factor) => Math.abs(ratio / factor - 1) < NEAR_RATIO)
}

/**
 * Start from the shortest strong period (classic MPM first key maximum),
 * then drop one or two octaves only when a mid-strength peak looks like a
 * weak fundamental rather than a subharmonic of a clean tone.
 */
export function selectFundamental(candidates: readonly PitchCandidate[]): PitchCandidate | undefined {
  const usable = candidates.filter((item) => item.frequency > 0 && item.score > 0)
  if (usable.length === 0) return undefined
  const best = usable.reduce((top, item) => (item.score > top.score ? item : top))
  const keyMaxima = usable
    .filter((item) => item.score >= best.score * KEY_MAX_RATIO)
    .sort((a, b) => b.frequency - a.frequency)
  const apparent = keyMaxima[0] ?? best
  const floor = Math.max(0.45, apparent.score * SCORE_RATIO_FOR_LOWER)
  const lowers = usable
    .filter(
      (item) =>
        isNearOctaveBelow(apparent.frequency, item.frequency) &&
        item.score >= floor &&
        item.score < apparent.score - EQUAL_SCORE_DELTA,
    )
    .sort((a, b) => a.frequency - b.frequency)
  return lowers[0] ?? apparent
}

function mergeCandidates(items: PitchCandidate[]): PitchCandidate[] {
  const sorted = [...items].sort((a, b) => a.frequency - b.frequency)
  const out: PitchCandidate[] = []
  for (const item of sorted) {
    const previous = out[out.length - 1]
    if (previous && Math.abs(item.frequency / previous.frequency - 1) < NEAR_RATIO) {
      if (item.score > previous.score) out[out.length - 1] = item
    } else {
      out.push(item)
    }
  }
  return out
}

export function detectPitch(
  samples: Float32Array,
  options: PitchDetectorOptions,
): CombinedPitchResult | null {
  const yin = detectPitchYin(samples, options)
  const mpm = detectPitchMpm(samples, options)
  const candidates = mergeCandidates([
    ...(yin
      ? [{ frequency: yin.frequency, score: yin.probability, source: 'yin' as const }]
      : []),
    ...((mpm?.peaks ?? []).map((peak) => ({
      frequency: peak.frequency,
      score: Math.max(0, peak.value),
      source: 'mpm' as const,
    })) ?? []),
  ])
  const picked = selectFundamental(
    candidates.length > 0
      ? candidates
      : [
          ...(yin ? [{ frequency: yin.frequency, score: yin.probability, source: 'yin' as const }] : []),
          ...(mpm ? [{ frequency: mpm.frequency, score: mpm.probability, source: 'mpm' as const }] : []),
        ],
  )
  if (!picked) return null
  const raw = yin?.frequency ?? mpm?.frequency ?? picked.frequency
  return {
    frequency: picked.frequency,
    probability: picked.score,
    tau: options.sampleRate / picked.frequency,
    candidates,
    rawFrequency: raw,
  }
}
