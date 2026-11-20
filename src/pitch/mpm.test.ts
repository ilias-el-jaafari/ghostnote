import { describe, expect, it } from 'vitest'
import { detectPitchMpm } from './mpm.ts'
import { frequencyToMidi } from './note.ts'
import { synthesizeHarmonicTone, synthesizeSine } from './yin.ts'

const SAMPLE_RATE = 44_100

function centsOff(got: number, expected: number) {
  return (frequencyToMidi(got) - frequencyToMidi(expected)) * 100
}

describe('detectPitchMpm', () => {
  it('detects a pure A4 sine at the fundamental, not a subharmonic', () => {
    const samples = synthesizeSine(440, SAMPLE_RATE, 0.25)
    const result = detectPitchMpm(samples, { sampleRate: SAMPLE_RATE })
    expect(result).not.toBeNull()
    expect(result!.frequency).toBeCloseTo(440, 0)
    expect(Math.abs(centsOff(result!.frequency, 440))).toBeLessThan(10)
    expect(result!.probability).toBeGreaterThan(0.9)
  })

  it('detects a low A2 sine', () => {
    const samples = synthesizeSine(110, SAMPLE_RATE, 0.25)
    const result = detectPitchMpm(samples, { sampleRate: SAMPLE_RATE })
    expect(result).not.toBeNull()
    expect(Math.abs(centsOff(result!.frequency, 110))).toBeLessThan(15)
  })

  it('returns key maxima including the fundamental of a harmonic tone', () => {
    const samples = synthesizeHarmonicTone(146.83, SAMPLE_RATE, 0.25, [1, 0.7, 0.45, 0.25])
    const result = detectPitchMpm(samples, { sampleRate: SAMPLE_RATE, minFrequency: 70 })
    expect(result).not.toBeNull()
    expect(Math.abs(centsOff(result!.frequency, 146.83))).toBeLessThan(20)
    const hasFundamental = result!.peaks.some((peak) => Math.abs(centsOff(peak.frequency, 146.83)) < 30)
    expect(hasFundamental).toBe(true)
  })
})
