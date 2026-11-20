/**
 * A compact “sung vowel”: a glottal / sawtooth source (1/n harmonics, weak
 * fundamental) sent through three formant resonators. Used to test that the
 * detector returns F0, not a boosted overtone, on male low notes.
 */

export type Formant = { frequency: number; bandwidth: number; gain: number }

const DEFAULT_FORMANTS: Formant[] = [
  { frequency: 620, bandwidth: 90, gain: 1 },
  { frequency: 1220, bandwidth: 110, gain: 0.7 },
  { frequency: 2550, bandwidth: 160, gain: 0.35 },
]

function formantGain(frequency: number, formants: readonly Formant[]): number {
  let gain = 0.08
  for (const formant of formants) {
    const delta = frequency - formant.frequency
    const sigma = formant.bandwidth
    gain += formant.gain * Math.exp((-0.5 * (delta * delta)) / (sigma * sigma))
  }
  return gain
}

/**
 * Additive glottal-like tone: harmonics fall as 1/n, then a gentle spectral
 * tilt, then a formant envelope that can make H2/H3 louder than F0.
 */
export function synthesizeFormantVoice(
  fundamental: number,
  sampleRate: number,
  durationSeconds: number,
  options: { harmonics?: number; tilt?: number; formants?: readonly Formant[]; level?: number; fundamentalGain?: number } = {},
): Float32Array {
  const n = Math.max(0, Math.floor(sampleRate * durationSeconds))
  const out = new Float32Array(n)
  const harmonics = options.harmonics ?? 16
  const tilt = options.tilt ?? 0.12
  const formants = options.formants ?? DEFAULT_FORMANTS
  const level = options.level ?? 0.7
  const amps: number[] = []
  let peak = 0
  for (let h = 1; h <= harmonics; h += 1) {
    const freq = fundamental * h
    if (freq >= sampleRate / 2) break
    const fundamentalGain = h === 1 ? (options.fundamentalGain ?? 1) : 1
    const amplitude = (1 / h) * Math.exp(-tilt * (h - 1)) * formantGain(freq, formants) * fundamentalGain
    amps.push(amplitude)
    peak += amplitude
  }
  const scale = peak > 0 ? level / peak : 0
  for (let i = 0; i < n; i += 1) {
    let sample = 0
    for (let h = 0; h < amps.length; h += 1) {
      const amplitude = amps[h] ?? 0
      sample += amplitude * Math.sin((2 * Math.PI * fundamental * (h + 1) * i) / sampleRate)
    }
    out[i] = sample * scale
  }
  return out
}
