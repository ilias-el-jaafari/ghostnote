import { describe, expect, it } from 'vitest'
import { frequencyToMidi } from './note.ts'
import {
  detectPitchYin,
  interpolateTau,
  RECOMMENDED_PITCH_WINDOW,
  shouldPreferLongerPeriod,
  synthesizeHarmonicTone,
  synthesizeSine,
} from './yin.ts'

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

  it('detects a −30 dBFS sine (quiet singing / soft mic level)', () => {
    const amplitude = 10 ** (-30 / 20)
    const result = detect(440, { amplitude })
    expect(result, 'expected a pitch for a −30 dBFS 440 Hz sine').not.toBeNull()
    expect(result?.frequency).toBeCloseTo(440, 0)
    const cents = (frequencyToMidi(result!.frequency) - frequencyToMidi(440)) * 100
    expect(Math.abs(cents)).toBeLessThan(10)
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

describe('shouldPreferLongerPeriod', () => {
  it('does not fold two already-excellent dips (pure sine at T and 2T)', () => {
    expect(shouldPreferLongerPeriod(0.0001, 0.00005, 0.15)).toBe(false)
    expect(shouldPreferLongerPeriod(0.003, 0.0009, 0.15)).toBe(false)
  })

  it('prefers the longer period when it is a clearly better fit', () => {
    expect(shouldPreferLongerPeriod(0.13, 0.013, 0.15)).toBe(true)
    expect(shouldPreferLongerPeriod(0.04, 0.02, 0.15)).toBe(true)
    expect(shouldPreferLongerPeriod(0.11, 0.10, 0.15)).toBe(true)
    expect(shouldPreferLongerPeriod(0.11, 0.4, 0.15)).toBe(false)
  })
})

describe('detectPitchYin — voice-like tones with a weak fundamental', () => {
  const SAMPLE = 48_000
  // Weak F0, strong 2nd and 3rd harmonics — the pattern that used to lock an octave up.
  const VOICE_PARTIALS = [0.12, 0.85, 0.55, 0.28]

  const cases: { name: string; hz: number }[] = [
    { name: 'E2 82.4 Hz', hz: 82.4068892282175 },
    { name: 'A2 110 Hz', hz: 110 },
    { name: 'E3 164.8 Hz', hz: 164.81377845643496 },
    { name: 'G3 196 Hz', hz: 195.99771799087463 },
    { name: 'A3 220 Hz', hz: 220 },
  ]

  it.each(cases)('returns the fundamental for $name, not an overtone', ({ hz }) => {
    const samples = synthesizeHarmonicTone(hz, SAMPLE, 0.12, VOICE_PARTIALS)
    const result = detectPitchYin(samples, {
      sampleRate: SAMPLE,
      minFrequency: 70,
      maxFrequency: 1000,
    })
    expect(result, `expected a pitch for ${hz} Hz`).not.toBeNull()
    if (!result) return
    const cents = (frequencyToMidi(result.frequency) - frequencyToMidi(hz)) * 100
    expect(Math.abs(cents), `got ${result.frequency.toFixed(2)} Hz`).toBeLessThan(20)
    // Must not be an octave (or a 12th) above the fundamental.
    expect(result.frequency).toBeLessThan(hz * 1.5)
  })

  it('resolves a low E2 on a 4096-sample / 48 kHz window', () => {
    const hz = 82.4068892282175
    const duration = RECOMMENDED_PITCH_WINDOW / SAMPLE
    expect(RECOMMENDED_PITCH_WINDOW).toBeGreaterThanOrEqual(4096)
    const samples = synthesizeHarmonicTone(hz, SAMPLE, duration, VOICE_PARTIALS)
    expect(samples.length).toBe(RECOMMENDED_PITCH_WINDOW)
    const result = detectPitchYin(samples, {
      sampleRate: SAMPLE,
      minFrequency: 70,
      maxFrequency: 1000,
    })
    expect(result).not.toBeNull()
    const cents = (frequencyToMidi(result!.frequency) - frequencyToMidi(hz)) * 100
    expect(Math.abs(cents)).toBeLessThan(20)
  })
})

function addDeterministicNoise(samples: Float32Array, amplitude: number, seed = 1): Float32Array {
  let state = seed >>> 0
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const noise = (state / 0x100000000) * 2 - 1
    out[i] = (samples[i] ?? 0) + amplitude * noise
  }
  return out
}

describe('detectPitchYin — H2-dominant voice that would otherwise lock an octave up', () => {
  const SAMPLE = 48_000
  // Almost no odd harmonics plus a bit of noise: the first YIN dip is at 2f,
  // but CMND at the true period is clearly better.
  const EVEN_HEAVY = [0.05, 1, 0.08, 0.03]

  const cases: { name: string; hz: number }[] = [
    { name: 'E2 82.4 Hz', hz: 82.4068892282175 },
    { name: 'A2 110 Hz', hz: 110 },
    { name: 'E3 164.8 Hz', hz: 164.81377845643496 },
    { name: 'G3 196 Hz', hz: 195.99771799087463 },
    { name: 'A3 220 Hz', hz: 220 },
  ]

  it.each(cases)('recovers the fundamental for $name', ({ hz }) => {
    const clean = synthesizeHarmonicTone(hz, SAMPLE, 0.12, EVEN_HEAVY)
    const samples = addDeterministicNoise(clean, 0.16)
    const result = detectPitchYin(samples, {
      sampleRate: SAMPLE,
      minFrequency: 70,
      maxFrequency: 1000,
    })
    expect(result, `expected a pitch for ${hz} Hz`).not.toBeNull()
    if (!result) return
    const cents = (frequencyToMidi(result.frequency) - frequencyToMidi(hz)) * 100
    expect(Math.abs(cents), `got ${result.frequency.toFixed(2)} Hz`).toBeLessThan(25)
    expect(result.frequency).toBeLessThan(hz * 1.5)
  })
})
