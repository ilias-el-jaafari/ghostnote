import { describe, expect, it } from 'vitest'
import {
  A4_HZ,
  C4_MIDI,
  comparePitchOctaveTolerant,
  centsDifference,
  frequencyToMidi,
  frequencyToNoteName,
  midiToFrequency,
  midiToNoteName,
  midiToUltraStarPitch,
  octaveTolerantCents,
  pitchClass,
  ultraStarPitchToMidi,
} from './note.ts'

describe('frequency and MIDI conversion', () => {
  it('maps A4 at 440 Hz to MIDI 69 and back', () => {
    expect(frequencyToMidi(A4_HZ)).toBeCloseTo(69, 10)
    expect(midiToFrequency(69)).toBeCloseTo(A4_HZ, 10)
  })

  it('maps C4 to MIDI 60 and UltraStar pitch 0', () => {
    const c4 = 261.6255653005986
    expect(frequencyToMidi(c4)).toBeCloseTo(C4_MIDI, 6)
    expect(ultraStarPitchToMidi(0)).toBe(60)
    expect(midiToUltraStarPitch(60)).toBe(0)
    expect(midiToUltraStarPitch(69)).toBe(9)
    expect(ultraStarPitchToMidi(9)).toBe(69)
  })

  it('maps octaves as 12 MIDI steps / a factor of two in frequency', () => {
    expect(frequencyToMidi(880)).toBeCloseTo(81, 10)
    expect(frequencyToMidi(220)).toBeCloseTo(57, 10)
    expect(midiToFrequency(81) / midiToFrequency(69)).toBeCloseTo(2, 10)
  })

  it('throws on non-positive frequencies', () => {
    expect(() => frequencyToMidi(0)).toThrow(RangeError)
    expect(() => frequencyToMidi(-1)).toThrow(RangeError)
    expect(() => centsDifference(0, 440)).toThrow(RangeError)
  })

  it('reports cents between two frequencies', () => {
    expect(centsDifference(440, 440)).toBeCloseTo(0, 10)
    expect(centsDifference(440, 880)).toBeCloseTo(1200, 10)
    // One equally tempered semitone is 100 cents.
    expect(centsDifference(440, midiToFrequency(70))).toBeCloseTo(100, 8)
  })
})

describe('note names', () => {
  it('names common pitches with scientific octaves', () => {
    expect(midiToNoteName(60)).toMatchObject({ name: 'C', octave: 4, label: 'C4', cents: 0 })
    expect(midiToNoteName(69)).toMatchObject({ name: 'A', octave: 4, label: 'A4' })
    expect(midiToNoteName(69.4).label).toBe('A4')
    expect(midiToNoteName(69.4).cents).toBeCloseTo(40, 6)
    expect(frequencyToNoteName(440).label).toBe('A4')
    expect(frequencyToNoteName(277.182630976872).label).toBe('C#4')
  })

  it('rounds to the nearest note and wraps pitch classes', () => {
    expect(midiToNoteName(59.6).label).toBe('C4')
    expect(midiToNoteName(-1).label).toBe('B-2') // MIDI -1 is B in octave -2
    expect(pitchClass(60)).toBe(0)
    expect(pitchClass(71)).toBe(11)
    expect(pitchClass(-1)).toBe(11)
  })
})

describe('octave-tolerant pitch comparison', () => {
  it('treats the same pitch class in another octave as a match', () => {
    const same = comparePitchOctaveTolerant(72, 60) // C5 vs C4
    expect(same.match).toBe(true)
    expect(same.cents).toBeCloseTo(0, 8)
    expect(comparePitchOctaveTolerant(57, 69).match).toBe(true) // A3 vs A4
  })

  it('rejects a neighbouring semitone at the default 50-cent tolerance', () => {
    const off = comparePitchOctaveTolerant(61, 60)
    expect(off.match).toBe(false)
    expect(off.cents).toBeCloseTo(100, 8)
    expect(off.semitones).toBeCloseTo(1, 8)
  })

  it('accepts a pitch within the tolerance, including a custom window', () => {
    expect(comparePitchOctaveTolerant(60.4, 60).match).toBe(true) // 40 cents
    expect(comparePitchOctaveTolerant(60.6, 60).match).toBe(false) // 60 cents
    expect(comparePitchOctaveTolerant(60.6, 60, 70).match).toBe(true)
  })

  it('wraps around the B / C boundary', () => {
    const almostC = comparePitchOctaveTolerant(71, 60) // B3 vs C4
    expect(almostC.match).toBe(false)
    expect(almostC.cents).toBeCloseTo(-100, 8)

    // MIDI 59 is B3; 59.3 is 30 cents sharp of B, which folds onto B4 (71).
    const justSharpB = comparePitchOctaveTolerant(59.3, 71)
    expect(justSharpB.cents).toBeCloseTo(30, 6)
    expect(justSharpB.match).toBe(true)
  })

  it('returns a signed, folded-cent value via octaveTolerantCents', () => {
    expect(octaveTolerantCents(60, 60)).toBeCloseTo(0, 10)
    expect(octaveTolerantCents(61, 60)).toBeCloseTo(100, 10)
    expect(octaveTolerantCents(59, 60)).toBeCloseTo(-100, 10)
    expect(octaveTolerantCents(72, 60)).toBeCloseTo(0, 10)
  })
})
