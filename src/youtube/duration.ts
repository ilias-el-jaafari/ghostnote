/**
 * Compare an original backing track's duration to an instrumental / karaoke
 * candidate so we can skip manual sync when the two masters are the same length.
 */

export const DURATION_MATCH_TOLERANCE_MS = 1000
/** Below this, treat the files as aligned and suggest offset 0. */
export const DURATION_ALIGN_ZERO_MS = 250

export type DurationComparison = {
  originalMs: number
  candidateMs: number
  /** candidate − original, in milliseconds. */
  diffMs: number
  absDiffMs: number
  /** True when the lengths are within {@link DURATION_MATCH_TOLERANCE_MS}. */
  sameLength: boolean
  /**
   * Suggested clock offset (added to media time). Same-length tracks default
   * to 0; a small residual uses half the duration gap as a weak estimate of
   * symmetric padding, still well under a second.
   */
  suggestedOffsetMs: number
}

export function compareDurations(
  originalMs: number,
  candidateMs: number,
  toleranceMs = DURATION_MATCH_TOLERANCE_MS,
): DurationComparison {
  const orig = Math.round(originalMs)
  const cand = Math.round(candidateMs)
  const diffMs = cand - orig
  const absDiffMs = Math.abs(diffMs)
  const sameLength = Number.isFinite(orig) && Number.isFinite(cand) && orig > 0 && cand > 0 && absDiffMs <= toleranceMs
  let suggestedOffsetMs = 0
  if (sameLength && absDiffMs > DURATION_ALIGN_ZERO_MS) {
    suggestedOffsetMs = Math.round(diffMs / 2)
  }
  return { originalMs: orig, candidateMs: cand, diffMs, absDiffMs, sameLength, suggestedOffsetMs }
}

export type DurationCandidate<T = { id: string }> = T & { durationMs: number }

/** Pick the candidate whose duration is closest to the original. */
export function pickClosestDuration<T extends { durationMs: number }>(
  originalMs: number,
  candidates: readonly T[],
): T | undefined {
  if (!(originalMs > 0) || candidates.length === 0) return undefined
  let best = candidates[0]
  if (!best) return undefined
  let bestAbs = Math.abs(best.durationMs - originalMs)
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i]
    if (!candidate) continue
    const abs = Math.abs(candidate.durationMs - originalMs)
    if (abs < bestAbs) {
      best = candidate
      bestAbs = abs
    }
  }
  return best
}

export function formatDurationMs(ms: number): string {
  if (!(ms >= 0) || !Number.isFinite(ms)) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatDurationDiff(absDiffMs: number): string {
  const seconds = Math.abs(absDiffMs) / 1000
  if (!Number.isFinite(seconds)) return '—'
  const rounded = Math.round(seconds * 10) / 10
  return Number.isInteger(rounded) ? `${rounded} s` : `${rounded.toFixed(1)} s`
}
