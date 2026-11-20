import { describe, expect, it } from 'vitest'
import {
  compareDurations,
  DURATION_MATCH_TOLERANCE_MS,
  formatDurationDiff,
  formatDurationMs,
  pickClosestDuration,
} from './duration.ts'

describe('compareDurations', () => {
  it('marks tracks as the same length when they differ by at most 1 s', () => {
    const exact = compareDurations(261_000, 261_000)
    expect(exact.sameLength).toBe(true)
    expect(exact.diffMs).toBe(0)
    expect(exact.suggestedOffsetMs).toBe(0)

    const under = compareDurations(261_000, 261_800)
    expect(under.sameLength).toBe(true)
    expect(under.absDiffMs).toBe(800)
    expect(under.absDiffMs).toBeLessThanOrEqual(DURATION_MATCH_TOLERANCE_MS)
    // Residual over 250 ms: half the gap is a weak estimate of symmetric padding.
    expect(under.suggestedOffsetMs).toBe(400)

    const close = compareDurations(180_000, 180_200)
    expect(close.sameLength).toBe(true)
    expect(close.suggestedOffsetMs).toBe(0)
  })

  it('warns when the lengths differ by more than 1 s and does not guess an offset', () => {
    const far = compareDurations(261_000, 275_500)
    expect(far.sameLength).toBe(false)
    expect(far.diffMs).toBe(14_500)
    expect(far.suggestedOffsetMs).toBe(0)
    expect(formatDurationDiff(far.absDiffMs)).toBe('14.5 s')
  })

  it('rejects missing or zero durations', () => {
    expect(compareDurations(0, 120_000).sameLength).toBe(false)
    expect(compareDurations(120_000, Number.NaN).sameLength).toBe(false)
  })
})

describe('pickClosestDuration', () => {
  it('selects the candidate nearest the original duration', () => {
    const original = 221_000
    const picked = pickClosestDuration(original, [
      { id: 'long____001', durationMs: 260_000 },
      { id: 'close___002', durationMs: 221_700 },
      { id: 'short___003', durationMs: 180_000 },
    ])
    expect(picked?.id).toBe('close___002')
    expect(compareDurations(original, picked!.durationMs).sameLength).toBe(true)
  })

  it('returns undefined when there is nothing to compare', () => {
    expect(pickClosestDuration(221_000, [])).toBeUndefined()
    expect(pickClosestDuration(0, [{ id: 'x', durationMs: 1000 }])).toBeUndefined()
  })
})

describe('formatDurationMs', () => {
  it('formats mm:ss', () => {
    expect(formatDurationMs(0)).toBe('0:00')
    expect(formatDurationMs(261_000)).toBe('4:21')
    expect(formatDurationMs(75_400)).toBe('1:15')
  })
})
