export type PitchDetectionResult = {
  /** Estimated fundamental frequency in Hz. */
  frequency: number
  /** 1 minus the YIN CMND value at the chosen tau (higher is more confident). */
  probability: number
  /** Estimated period in samples, after parabolic interpolation. */
  tau: number
}

export type PitchDetectorOptions = {
  sampleRate: number
  /** YIN absolute threshold. Typical values are 0.1–0.15. */
  threshold?: number
  minFrequency?: number
  maxFrequency?: number
  /** RMS below this is treated as silence. */
  minRms?: number
  /**
   * If no tau falls under `threshold`, still accept the global minimum
   * when its CMND is at most this value. Set lower to be stricter.
   */
  fallbackThreshold?: number
}

const DEFAULT_THRESHOLD = 0.15
/** Lowest pitch we try to track (about C#2 / a low sung bass note). */
export const DEFAULT_MIN_PITCH_HZ = 70
export const DEFAULT_MAX_PITCH_HZ = 1000
/**
 * Minimum time-domain window (samples) so YIN can resolve ~70 Hz at 48 kHz.
 * Two to three periods of 70 Hz is ~1370–2057 samples; 4096 leaves headroom.
 */
export const RECOMMENDED_PITCH_WINDOW = 4096
const DEFAULT_MIN_HZ = DEFAULT_MIN_PITCH_HZ
const DEFAULT_MAX_HZ = DEFAULT_MAX_PITCH_HZ
const DEFAULT_MIN_RMS = 0.001
const DEFAULT_FALLBACK = 0.45

/**
 * CMND values this small are already "perfect" dips (typical of a pure sine
 * at T, 2T, and 3T). Never fold those down an octave — 2T/3T can look
 * slightly deeper just because of the sampling grid.
 */
const CLEAN_DIP = 0.01
/** Prefer a longer period when its CMND is at most this fraction of the short dip. */
const IMPROVEMENT_RATIO = 0.7
/** A first dip at or above this is "mediocre" — likely an overtone. */
const MEDIOCRE_DIP = 0.08

function rmsOf(samples: Float32Array): number {
  let sumSq = 0
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0
    sumSq += sample * sample
  }
  return Math.sqrt(sumSq / samples.length)
}

/**
 * Parabolic interpolation around a discrete minimum, as used by YIN.
 * Returns an adjusted tau (may be fractional).
 */
export function interpolateTau(cmnd: Float32Array, tau: number): number {
  if (tau <= 0 || tau >= cmnd.length - 1) return tau
  const s0 = cmnd[tau - 1]
  const s1 = cmnd[tau]
  const s2 = cmnd[tau + 1]
  if (s0 === undefined || s1 === undefined || s2 === undefined) return tau
  const denom = 2 * (2 * s1 - s2 - s0)
  if (denom === 0) return tau
  return tau + (s2 - s0) / denom
}

/** Walk to the nearest local minimum of `cmnd` around `around`. */
export function localMinimumTau(
  cmnd: Float32Array,
  around: number,
  tauMin: number,
  tauMax: number,
): number {
  let tau = Math.min(tauMax, Math.max(tauMin, Math.round(around)))
  while (tau + 1 <= tauMax && (cmnd[tau + 1] ?? 1) < (cmnd[tau] ?? 1)) {
    tau += 1
  }
  while (tau - 1 >= tauMin && (cmnd[tau - 1] ?? 1) < (cmnd[tau] ?? 1)) {
    tau -= 1
  }
  return tau
}

/**
 * If the first YIN dip is an overtone (f, 2f, or 3f), prefer the longer
 * period when its CMND is meaningfully better. Pure sines keep the first
 * dip: T, 2T and 3T are all near-zero, so a clean short dip is never folded.
 * Candidates are compared against the current best so 3τ is not chosen
 * after a strong 2τ (which would land at 3/2 of the true period).
 */
export function preferFundamentalTau(
  cmnd: Float32Array,
  tau: number,
  tauMin: number,
  tauMax: number,
  threshold: number,
): number {
  let best = tau
  let bestVal = cmnd[tau] ?? 1
  for (const multiple of [2, 3]) {
    const expected = tau * multiple
    if (expected > tauMax) continue
    const candidate = localMinimumTau(cmnd, expected, tauMin, tauMax)
    if (Math.abs(candidate - expected) / expected > 0.06) continue
    const longVal = cmnd[candidate] ?? 1
    if (shouldPreferLongerPeriod(bestVal, longVal, threshold) && candidate > best) {
      best = candidate
      bestVal = longVal
    }
  }
  return best
}

export function shouldPreferLongerPeriod(
  shortVal: number,
  longVal: number,
  threshold: number,
): boolean {
  if (longVal > Math.max(threshold, shortVal)) return false
  // Both dips are already excellent — keep the first (shortest) period.
  if (shortVal < CLEAN_DIP && longVal < CLEAN_DIP) return false
  // Longer period is clearly a better fit (true fundamental).
  if (longVal <= shortVal * IMPROVEMENT_RATIO) return true
  // Mediocre first dip with a still-acceptable longer dip.
  return shortVal >= MEDIOCRE_DIP && longVal <= threshold && longVal <= shortVal * 1.2
}

/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
 * Operates on a mono time-domain buffer; no Web Audio dependency, so it
 * can be unit-tested with synthesized sines.
 */
export function detectPitchYin(
  samples: Float32Array,
  options: PitchDetectorOptions,
): PitchDetectionResult | null {
  const sampleRate = options.sampleRate
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  const minFrequency = options.minFrequency ?? DEFAULT_MIN_HZ
  const maxFrequency = options.maxFrequency ?? DEFAULT_MAX_HZ
  const minRms = options.minRms ?? DEFAULT_MIN_RMS
  const fallbackThreshold = options.fallbackThreshold ?? DEFAULT_FALLBACK

  const n = samples.length
  if (n < 32 || !(sampleRate > 0)) return null
  if (rmsOf(samples) < minRms) return null

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency))
  const tauMax = Math.min(n - 1, Math.ceil(sampleRate / minFrequency))
  if (tauMax <= tauMin) return null

  const d = new Float32Array(tauMax + 1)
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0
    const limit = n - tau
    for (let j = 0; j < limit; j += 1) {
      const delta = (samples[j] ?? 0) - (samples[j + tau] ?? 0)
      sum += delta * delta
    }
    d[tau] = sum
  }

  const cmnd = new Float32Array(tauMax + 1)
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= tauMax; tau += 1) {
    running += d[tau] ?? 0
    cmnd[tau] = running === 0 ? 1 : ((d[tau] ?? 0) * tau) / running
  }

  let tauEstimate = -1
  for (let tau = tauMin; tau < tauMax; tau += 1) {
    if ((cmnd[tau] ?? 1) < threshold) {
      while (tau + 1 <= tauMax && (cmnd[tau + 1] ?? 1) < (cmnd[tau] ?? 1)) {
        tau += 1
      }
      tauEstimate = tau
      break
    }
  }

  if (tauEstimate === -1) {
    let minVal = Number.POSITIVE_INFINITY
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      const value = cmnd[tau] ?? 1
      if (value < minVal) {
        minVal = value
        tauEstimate = tau
      }
    }
    if (minVal > fallbackThreshold) return null
  }

  tauEstimate = preferFundamentalTau(cmnd, tauEstimate, tauMin, tauMax, threshold)

  const betterTau = interpolateTau(cmnd, tauEstimate)
  if (!(betterTau > 0)) return null
  const frequency = sampleRate / betterTau
  if (frequency < minFrequency || frequency > maxFrequency) return null

  return {
    frequency,
    probability: 1 - (cmnd[tauEstimate] ?? 1),
    tau: betterTau,
  }
}

/** Build a mono sine (optionally with a phase offset) for tests and fixtures. */
export function synthesizeSine(
  frequency: number,
  sampleRate: number,
  durationSeconds: number,
  amplitude = 0.8,
  phase = 0,
): Float32Array {
  const n = Math.max(0, Math.floor(sampleRate * durationSeconds))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate + phase)
  }
  return out
}

/**
 * Additive harmonic tone for tests. `harmonicAmplitudes[0]` is the
 * fundamental, `[1]` the 2nd harmonic, and so on.
 */
export function synthesizeHarmonicTone(
  fundamental: number,
  sampleRate: number,
  durationSeconds: number,
  harmonicAmplitudes: readonly number[],
  phase = 0,
): Float32Array {
  const n = Math.max(0, Math.floor(sampleRate * durationSeconds))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    let sample = 0
    for (let h = 0; h < harmonicAmplitudes.length; h += 1) {
      const amplitude = harmonicAmplitudes[h] ?? 0
      if (amplitude === 0) continue
      sample += amplitude * Math.sin((2 * Math.PI * fundamental * (h + 1) * i) / sampleRate + phase)
    }
    out[i] = sample
  }
  return out
}
