import { describe, expect, it } from 'vitest'
import { detectPitch, selectFundamental } from './detect.ts'
import { ANALYSIS_HIGHPASS_HZ } from './usePitchDetection.ts'
import { MIC_AUDIO_CONSTRAINTS } from './micConstraints.ts'
import { frequencyToMidi } from './note.ts'
import { synthesizeFormantVoice } from './voice.ts'
import { detectPitchYin, pitchWindowSamples, RECOMMENDED_PITCH_WINDOW, synthesizeSine } from './yin.ts'

const SAMPLE_RATE = 44_100
const WINDOW = 0.25

function centsOff(got: number, expected: number) {
  return (frequencyToMidi(got) - frequencyToMidi(expected)) * 100
}

const MALE_LOW_NOTES = [
  { name: 'A2', hz: 110 },
  { name: 'B2', hz: 123.47082531403103 },
  { name: 'C3', hz: 130.8127826502993 },
  { name: 'D3', hz: 146.8323839587038 },
] as const

describe('detectPitch — combined YIN + MPM', () => {
  it('does not fold a clean A4 sine down an octave', () => {
    const samples = synthesizeSine(440, SAMPLE_RATE, WINDOW)
    const result = detectPitch(samples, { sampleRate: SAMPLE_RATE })
    expect(result).not.toBeNull()
    expect(Math.abs(centsOff(result!.frequency, 440))).toBeLessThan(10)
  })

  it.each(MALE_LOW_NOTES)(
    'returns F0 (not a higher overtone) for a formant male voice at $name',
    ({ hz }) => {
      const samples = synthesizeFormantVoice(hz, SAMPLE_RATE, WINDOW)
      const result = detectPitch(samples, { sampleRate: SAMPLE_RATE, minFrequency: 70 })
      expect(result, `expected a pitch for ${hz} Hz`).not.toBeNull()
      if (!result) return
      expect(Math.abs(centsOff(result.frequency, hz))).toBeLessThan(40)
      expect(result.frequency).toBeLessThan(hz * 1.5)
    },
  )

  it('still finds A2 when the fundamental is deliberately weakened', () => {
    const samples = synthesizeFormantVoice(110, SAMPLE_RATE, WINDOW, { fundamentalGain: 0.25 })
    const result = detectPitch(samples, { sampleRate: SAMPLE_RATE, minFrequency: 70 })
    expect(result).not.toBeNull()
    expect(Math.abs(centsOff(result!.frequency, 110))).toBeLessThan(40)
  })

  it('drops to a weaker F0 under a strong overtone, but not to equal-score subharmonics', () => {
    const weakF0 = selectFundamental([
      { frequency: 220, score: 0.95, source: 'yin' },
      { frequency: 110, score: 0.72, source: 'mpm' },
    ])
    expect(weakF0?.frequency).toBe(110)

    const cleanSine = selectFundamental([
      { frequency: 440, score: 1, source: 'yin' },
      { frequency: 220, score: 1, source: 'mpm' },
      { frequency: 146.67, score: 1, source: 'mpm' },
      { frequency: 110, score: 1, source: 'mpm' },
    ])
    expect(cleanSine?.frequency).toBe(440)

    const periodicVowel = selectFundamental([
      { frequency: 146.83, score: 1, source: 'yin' },
      { frequency: 73.42, score: 1, source: 'mpm' },
    ])
    expect(periodicVowel?.frequency).toBe(146.83)
  })
})

describe('pitch window and mic constraints', () => {
  it('sizes the analyser window to at least two periods at 48 kHz', () => {
    const size = pitchWindowSamples(48_000, 70)
    expect(size).toBeGreaterThanOrEqual((2 * 48_000) / 70)
    expect(size).toBeGreaterThanOrEqual(RECOMMENDED_PITCH_WINDOW)
    expect([4096, 8192, 16384, 32768]).toContain(size)
  })

  it('grows the window when the sample rate or lowest note demands it', () => {
    expect(pitchWindowSamples(96_000, 70)).toBeGreaterThanOrEqual((2 * 96_000) / 70)
    expect(pitchWindowSamples(48_000, 40)).toBeGreaterThanOrEqual((2 * 48_000) / 40)
  })

  it('disables echo cancellation, noise suppression, and AGC', () => {
    expect(MIC_AUDIO_CONSTRAINTS.echoCancellation).toBe(false)
    expect(MIC_AUDIO_CONSTRAINTS.noiseSuppression).toBe(false)
    expect(MIC_AUDIO_CONSTRAINTS.autoGainControl).toBe(false)
  })

  it('only high-passes below about 60 Hz', () => {
    expect(ANALYSIS_HIGHPASS_HZ).toBe(60)
  })
})

describe('YIN still available for comparison', () => {
  it('detects a mid sine', () => {
    const samples = synthesizeSine(440, SAMPLE_RATE, WINDOW)
    const yin = detectPitchYin(samples, { sampleRate: SAMPLE_RATE })
    expect(yin?.frequency).toBeCloseTo(440, 0)
  })
})
