import { describe, expect, it } from 'vitest'
import { detectPitchYin, synthesizeSine } from '../pitch/yin.ts'
import {
  amplitudeFromDbfs,
  clampUnit,
  computeRms,
  DEFAULT_GUIDE_VOLUME,
  DEFAULT_MIC_MIN_RMS,
  DEFAULT_MIC_SENSITIVITY,
  guideGainFor,
  normalizeToRms,
  parseStoredUnit,
  rmsGateForSensitivity,
  yinThresholdForSensitivity,
} from './mix.ts'

describe('unit helpers', () => {
  it('clamps and parses stored 0–1 values', () => {
    expect(clampUnit(1.4)).toBe(1)
    expect(clampUnit(-2)).toBe(0)
    expect(parseStoredUnit('0.4', 0.75)).toBe(0.4)
    expect(parseStoredUnit('nope', 0.75)).toBe(0.75)
    expect(parseStoredUnit(null, 0.22)).toBe(0.22)
  })
})

describe('guide gain', () => {
  it('is clearly louder than the old 0.035–0.07 cues, and ducks only slightly under audio', () => {
    expect(DEFAULT_GUIDE_VOLUME).toBeGreaterThan(0.15)
    expect(guideGainFor(DEFAULT_GUIDE_VOLUME, false)).toBe(DEFAULT_GUIDE_VOLUME)
    expect(guideGainFor(DEFAULT_GUIDE_VOLUME, true)).toBeGreaterThan(0.15)
    expect(guideGainFor(DEFAULT_GUIDE_VOLUME, true)).toBeLessThan(DEFAULT_GUIDE_VOLUME)
    expect(guideGainFor(DEFAULT_GUIDE_VOLUME, false, true)).toBe(0)
  })
})

describe('mic sensitivity', () => {
  it('lowers the RMS gate as sensitivity rises', () => {
    const quiet = rmsGateForSensitivity(1)
    const mid = rmsGateForSensitivity(DEFAULT_MIC_SENSITIVITY)
    const loud = rmsGateForSensitivity(0)
    expect(quiet).toBeLessThan(mid)
    expect(mid).toBeLessThan(loud)
    expect(DEFAULT_MIC_MIN_RMS).toBe(mid)
    expect(mid).toBeLessThan(0.008)
    expect(yinThresholdForSensitivity(1)).toBeGreaterThan(yinThresholdForSensitivity(0))
  })
})

describe('low-amplitude pitch detection', () => {
  const SAMPLE_RATE = 44_100
  const DURATION = 0.25

  it('detects a −30 dBFS sine with the default YIN gate', () => {
    const amplitude = amplitudeFromDbfs(-30)
    expect(amplitude).toBeCloseTo(0.031622776, 5)
    const samples = synthesizeSine(440, SAMPLE_RATE, DURATION, amplitude)
    expect(computeRms(samples)).toBeGreaterThan(DEFAULT_MIC_MIN_RMS)
    const result = detectPitchYin(samples, { sampleRate: SAMPLE_RATE })
    expect(result, 'expected a pitch for a −30 dBFS 440 Hz sine').not.toBeNull()
    expect(result?.frequency).toBeCloseTo(440, 0)
  })

  it('detects a −40 dBFS sine after software auto-gain', () => {
    const samples = synthesizeSine(440, SAMPLE_RATE, DURATION, amplitudeFromDbfs(-40))
    const boosted = normalizeToRms(samples)
    expect(computeRms(boosted)).toBeGreaterThan(0.05)
    const result = detectPitchYin(boosted, { sampleRate: SAMPLE_RATE })
    expect(result).not.toBeNull()
    expect(result?.frequency).toBeCloseTo(440, 0)
  })

  it('does not invent a pitch from true silence', () => {
    const silence = new Float32Array(8192)
    expect(normalizeToRms(silence)).toBe(silence)
    expect(detectPitchYin(normalizeToRms(silence), { sampleRate: SAMPLE_RATE })).toBeNull()
  })
})
