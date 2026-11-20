import { describe, expect, it } from 'vitest'
import { isOctaveOrHarmonicJump, medianOf, OctaveHysteresis } from './smooth.ts'

describe('medianOf', () => {
  it('returns the middle value of an odd-length list', () => {
    expect(medianOf([220, 440, 221])).toBe(221)
  })

  it('averages the two central values of an even-length list', () => {
    expect(medianOf([100, 200, 300, 400])).toBe(250)
  })
})

describe('isOctaveOrHarmonicJump', () => {
  it('detects octave and 3× jumps, but not a fifth or a step', () => {
    expect(isOctaveOrHarmonicJump(220, 440)).toBe(true)
    expect(isOctaveOrHarmonicJump(440, 220)).toBe(true)
    expect(isOctaveOrHarmonicJump(110, 330)).toBe(true)
    expect(isOctaveOrHarmonicJump(220, 329.63)).toBe(false) // fifth-ish
    expect(isOctaveOrHarmonicJump(220, 246.94)).toBe(false) // whole step
  })
})

describe('OctaveHysteresis', () => {
  it('rejects a sudden octave jump until it is sustained', () => {
    const smoother = new OctaveHysteresis({ window: 3, confirmFrames: 3, silenceReset: 6 })
    expect(smoother.push(220)).toBeCloseTo(220, 0)
    expect(smoother.push(220)).toBeCloseTo(220, 0)
    expect(smoother.push(220)).toBeCloseTo(220, 0)
    // One or two frames at the octave must not move the lock.
    expect(smoother.push(440)).toBeCloseTo(220, 0)
    expect(smoother.push(440)).toBeCloseTo(220, 0)
    // Three consecutive octave frames are treated as a real register change.
    expect(smoother.push(440)).toBeCloseTo(440, 0)
    expect(smoother.push(440)).toBeCloseTo(440, 0)
  })

  it('keeps the lock through a brief overtone spike then a return', () => {
    const smoother = new OctaveHysteresis({ window: 3, confirmFrames: 3 })
    for (const hz of [196, 196, 196, 392, 196, 196]) {
      const out = smoother.push(hz)
      expect(out, `expected ~196 after ${hz}`).toBeCloseTo(196, 0)
    }
  })

  it('does not delay a non-octave melody leap (a fifth)', () => {
    const smoother = new OctaveHysteresis({ window: 3, confirmFrames: 3 })
    smoother.push(220)
    smoother.push(220)
    smoother.push(220)
    const jumped = smoother.push(330)
    expect(jumped).not.toBeNull()
    expect(Math.abs((jumped ?? 0) - 220)).toBeGreaterThan(20)
  })

  it('clears the lock after a stretch of silence', () => {
    const smoother = new OctaveHysteresis({ window: 3, confirmFrames: 3, silenceReset: 3 })
    smoother.push(220)
    smoother.push(220)
    expect(smoother.push(null)).toBeCloseTo(220, 0)
    expect(smoother.push(null)).toBeCloseTo(220, 0)
    expect(smoother.push(null)).toBeNull()
    expect(smoother.lockedFrequency).toBeUndefined()
  })
})
