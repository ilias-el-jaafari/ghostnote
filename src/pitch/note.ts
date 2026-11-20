/** A4 is MIDI note 69 at 440 Hz. C4 (UltraStar pitch 0) is MIDI 60. */
export const A4_HZ = 440
export const A4_MIDI = 69
export const C4_MIDI = 60

export const PITCH_CLASS_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export type PitchClassName = (typeof PITCH_CLASS_NAMES)[number]

export type NamedNote = {
  /** Scientific pitch name without octave, e.g. "A" or "C#". */
  name: PitchClassName
  /** Scientific octave. MIDI 60 is C4. */
  octave: number
  /** Nearest MIDI note number. */
  midi: number
  /** How far the exact MIDI value is from the nearest note, in cents. */
  cents: number
  /** Display label such as "A4". */
  label: string
}

export function frequencyToMidi(frequency: number): number {
  if (!(frequency > 0)) {
    throw new RangeError('Frequency must be a positive number')
  }
  return A4_MIDI + 12 * Math.log2(frequency / A4_HZ)
}

export function midiToFrequency(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12)
}

/** UltraStar pitch is the number of half-steps relative to C4. */
export function ultraStarPitchToMidi(pitch: number): number {
  return C4_MIDI + pitch
}

export function midiToUltraStarPitch(midi: number): number {
  return midi - C4_MIDI
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12
}

export function midiToNoteName(midi: number): NamedNote {
  const rounded = Math.round(midi)
  const cents = (midi - rounded) * 100
  const classIndex = ((rounded % 12) + 12) % 12
  const name = PITCH_CLASS_NAMES[classIndex] ?? 'C'
  const octave = Math.floor(rounded / 12) - 1
  return {
    name,
    octave,
    midi: rounded,
    cents,
    label: `${name}${octave}`,
  }
}

export function frequencyToNoteName(frequency: number): NamedNote {
  return midiToNoteName(frequencyToMidi(frequency))
}

export function centsDifference(fromHz: number, toHz: number): number {
  if (!(fromHz > 0) || !(toHz > 0)) {
    throw new RangeError('Frequencies must be positive')
  }
  return 1200 * Math.log2(toHz / fromHz)
}

/**
 * Shortest signed distance in cents between two MIDI values,
 * ignoring octave (pitch-class comparison on a circle of 12 semitones).
 * Positive means `sungMidi` is sharp of `targetMidi`.
 */
export function octaveTolerantCents(sungMidi: number, targetMidi: number): number {
  let semitones = sungMidi - targetMidi
  semitones = ((((semitones + 6) % 12) + 12) % 12) - 6
  return semitones * 100
}

export type PitchMatch = {
  match: boolean
  /** Signed cents after folding into a ±600 cent (one octave) window. */
  cents: number
  /** Absolute semitone distance on the pitch-class circle (0–6). */
  semitones: number
}

/**
 * Compare a sung pitch to a target UltraStar/MIDI pitch, ignoring octave.
 * Default tolerance is 50 cents (a quarter-tone).
 */
export function comparePitchOctaveTolerant(
  sungMidi: number,
  targetMidi: number,
  toleranceCents = 50,
): PitchMatch {
  const cents = octaveTolerantCents(sungMidi, targetMidi)
  const semitones = Math.abs(cents) / 100
  return {
    match: Math.abs(cents) <= toleranceCents,
    cents,
    semitones,
  }
}
