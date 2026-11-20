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
const DEFAULT_MIN_HZ = 80
const DEFAULT_MAX_HZ = 1000
const DEFAULT_MIN_RMS = 0.001
const DEFAULT_FALLBACK = 0.45

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
