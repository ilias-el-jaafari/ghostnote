import { describe, expect, it } from 'vitest'
import { frequencyToMidi } from './note.ts'
import { detectPitchYin, interpolateTau, synthesizeSine } from './yin.ts'

const SAMPLE_RATE = 44_100
const DURATION = 0.25

function detect(
  frequency: number,
  extra?: { amplitude?: number; phase?: number; duration?: number },
) {
  const samples = synthesizeSine(
    frequency,
    SAMPLE_RATE,
    extra?.duration ?? DURATION,
    extra?.amplitude ?? 0.8,
    extra?.phase ?? 0,
  )
  return detectPitchYin(samples, { sampleRate: SAMPLE_RATE })
}

describe('synthesizeSine', () => {
  it('creates a buffer of the requested length and amplitude', () => {
    const samples = synthesizeSine(440, 1000, 0.5, 0.5)
    expect(samples.length).toBe(500)
    const peak = Math.max(...samples.map((value) => Math.abs(value)))
    expect(peak).toBeGreaterThan(0.49)
    expect(peak).toBeLessThanOrEqual(0.5)
  })
})

describe('interpolateTau', () => {
  it('returns the original tau at the ends or when the valley is symmetric', () => {
    const cmnd = new Float32Array([1, 0.4, 0.1, 0.4, 1])
    expect(interpolateTau(cmnd, 2)).toBeCloseTo(2, 8)
    expect(interpolateTau(cmnd, 0)).toBe(0)
    expect(interpolateTau(cmnd, 4)).toBe(4)
  })

  it('shifts tau toward the lower neighbour of an asymmetric valley', () => {
    const cmnd = new Float32Array([1, 0.2, 0.1, 0.5, 1])
    const adjusted = interpolateTau(cmnd, 2)
    expect(adjusted).toBeLessThan(2)
    expect(adjusted).toBeGreaterThan(1)
  })
})

describe('detectPitchYin — pure sines at known frequencies', () => {
  const cases: { name: string; hz: number }[] = [
    { name: 'A4 440 Hz', hz: 440 },
    { name: 'C4 261.63 Hz', hz: 261.6255653005986 },
    { name: 'A3 220 Hz', hz: 220 },
    { name: 'A5 880 Hz', hz: 880 },
    { name: 'C5 523.25 Hz', hz: 523.2511306011972 },
    { name: 'E4 329.63 Hz', hz: 329.6275569128699 },
    { name: 'G4 392 Hz', hz: 391.9954359817493 },
    { name: 'low sung G3 196 Hz', hz: 195.99771799087463 },
  ]

  it.each(cases)('detects $name within 1 Hz and 10 cents', ({ hz }) => {
    const result = detect(hz)
    expect(result, `expected a pitch for ${hz} Hz`).not.toBeNull()
    if (!result) return
    expect(result.frequency).toBeCloseTo(hz, 0) // within ~0.5–1 Hz typically much closer
    const cents = (frequencyToMidi(result.frequency) - frequencyToMidi(hz)) * 100
    expect(Math.abs(cents)).toBeLessThan(10)
    expect(result.probability).toBeGreaterThan(0.8)
  })

  it('stays accurate with a different phase and a quieter amplitude', () => {
    const result = detect(440, { amplitude: 0.15, phase: 1.3 })
    expect(result).not.toBeNull()
    expect(result?.frequency).toBeCloseTo(440, 0)
  })

  it('returns null for silence and near-silence', () => {
    const silence = new Float32Array(8192)
    expect(detectPitchYin(silence, { sampleRate: SAMPLE_RATE })).toBeNull()

    const quiet = synthesizeSine(440, SAMPLE_RATE, DURATION, 0.0001)
    expect(detectPitchYin(quiet, { sampleRate: SAMPLE_RATE })).toBeNull()
  })

  it('returns null for a buffer that is too short or a bad sample rate', () => {
    const short = synthesizeSine(440, SAMPLE_RATE, 0.0005)
    expect(detectPitchYin(short, { sampleRate: SAMPLE_RATE })).toBeNull()
    const samples = synthesizeSine(440, SAMPLE_RATE, DURATION)
    expect(detectPitchYin(samples, { sampleRate: 0 })).toBeNull()
  })

  it('returns null when the frequency is outside the configured range', () => {
    const low = synthesizeSine(50, SAMPLE_RATE, 0.4)
    expect(
      detectPitchYin(low, { sampleRate: SAMPLE_RATE, minFrequency: 80, maxFrequency: 1000 }),
    ).toBeNull()

    // 1500 Hz sits below the minimum period allowed by maxFrequency=1000,
    // so YIN must not report 1500 Hz. It may lock onto a subharmonic, or return null.
    const high = synthesizeSine(1500, SAMPLE_RATE, DURATION)
    const highResult = detectPitchYin(high, {
      sampleRate: SAMPLE_RATE,
      minFrequency: 80,
      maxFrequency: 1000,
    })
    if (highResult) {
      expect(highResult.frequency).toBeLessThanOrEqual(1000)
      expect(Math.abs(highResult.frequency - 1500)).toBeGreaterThan(100)
    }
  })

  it('detects a high note when the search range includes it', () => {
    const hz = 1500
    const samples = synthesizeSine(hz, SAMPLE_RATE, DURATION)
    const result = detectPitchYin(samples, {
      sampleRate: SAMPLE_RATE,
      minFrequency: 80,
      maxFrequency: 2000,
    })
    expect(result).not.toBeNull()
    expect(result?.frequency).toBeCloseTo(hz, 0)
  })

  it('can track a lower note if the search range and window are widened', () => {
    const hz = 82.4068892282175 // E2, around a low sung bass note
    const samples = synthesizeSine(hz, SAMPLE_RATE, 0.4)
    const result = detectPitchYin(samples, {
      sampleRate: SAMPLE_RATE,
      minFrequency: 70,
      maxFrequency: 1000,
    })
    expect(result).not.toBeNull()
    expect(result?.frequency).toBeCloseTo(hz, 0)
  })
})
