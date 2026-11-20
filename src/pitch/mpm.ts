/**
 * McLeod Pitch Method (MPM) using the Normalised Square Difference Function
 * (NSDF). Key maxima are peaks at least `cutoff` (default 0.9) of the highest
 * peak; the first (lowest-frequency) key maximum is the classic MPM pick.
 */

export type MpmOptions = {
  sampleRate: number
  minFrequency?: number
  maxFrequency?: number
  minRms?: number
  cutoff?: number
}

export type MpmPeak = {
  tau: number
  value: number
  frequency: number
  key: boolean
}

export const MPM_CUTOFF = 0.9
const DEFAULT_MIN_HZ = 70
const DEFAULT_MAX_HZ = 1000
const DEFAULT_MIN_RMS = 0.001

function rmsOf(samples: Float32Array): number {
  let sumSq = 0
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0
    sumSq += sample * sample
  }
  return Math.sqrt(sumSq / Math.max(1, samples.length))
}

export function interpolatePeak(values: Float32Array, index: number): number {
  if (index <= 0 || index >= values.length - 1) return index
  const s0 = values[index - 1]
  const s1 = values[index]
  const s2 = values[index + 1]
  if (s0 === undefined || s1 === undefined || s2 === undefined) return index
  const denom = 2 * (2 * s1 - s2 - s0)
  if (denom === 0) return index
  return index + (s2 - s0) / denom
}

/** NSDF(tau) = 2 r(tau) / (m0 + m_tau), in [-1, 1]. */
export function computeNsdf(samples: Float32Array, tauMax: number): Float32Array {
  const n = samples.length
  const limit = Math.min(tauMax, n - 1)
  const nsdf = new Float32Array(limit + 1)
  nsdf[0] = 1
  for (let tau = 1; tau <= limit; tau += 1) {
    let ac = 0
    let m = 0
    const end = n - tau
    for (let j = 0; j < end; j += 1) {
      const a = samples[j] ?? 0
      const b = samples[j + tau] ?? 0
      ac += a * b
      m += a * a + b * b
    }
    nsdf[tau] = m === 0 ? 0 : (2 * ac) / m
  }
  return nsdf
}

/**
 * Peaks of the NSDF between rising and falling zero-crossings, including
 * whether each one is a “key maximum” at the given cutoff of the global peak.
 */
export function findNsdfPeaks(
  nsdf: Float32Array,
  tauMin: number,
  tauMax: number,
  cutoff = MPM_CUTOFF,
): MpmPeak[] {
  const maxTau = Math.min(tauMax, nsdf.length - 1)
  const peaks: { tau: number; value: number }[] = []
  let tau = Math.max(1, tauMin)
  while (tau < maxTau) {
    // Advance to a rising zero crossing (nsdf goes from <=0 to >0).
    while (tau < maxTau && (nsdf[tau] ?? 0) <= 0) tau += 1
    let bestTau = tau
    let bestVal = nsdf[tau] ?? -1
    while (tau < maxTau && (nsdf[tau] ?? 0) >= 0) {
      const value = nsdf[tau] ?? -1
      if (value > bestVal) {
        bestVal = value
        bestTau = tau
      }
      tau += 1
    }
    if (bestVal > 0) peaks.push({ tau: bestTau, value: bestVal })
  }
  if (peaks.length === 0) return []
  const highest = peaks.reduce((max, peak) => Math.max(max, peak.value), 0)
  const threshold = highest * cutoff
  return peaks.map((peak) => {
    const refined = interpolatePeak(nsdf, peak.tau)
    return { tau: refined, value: peak.value, frequency: 0, key: peak.value >= threshold }
  })
}

export function detectPitchMpm(samples: Float32Array, options: MpmOptions) {
  const sampleRate = options.sampleRate
  const minFrequency = options.minFrequency ?? DEFAULT_MIN_HZ
  const maxFrequency = options.maxFrequency ?? DEFAULT_MAX_HZ
  const minRms = options.minRms ?? DEFAULT_MIN_RMS
  const cutoff = options.cutoff ?? MPM_CUTOFF
  const n = samples.length
  if (n < 32 || !(sampleRate > 0)) return null
  if (rmsOf(samples) < minRms) return null

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency))
  const tauMax = Math.min(n - 1, Math.ceil(sampleRate / minFrequency))
  if (tauMax <= tauMin) return null

  const nsdf = computeNsdf(samples, tauMax)
  const peaks = findNsdfPeaks(nsdf, tauMin, tauMax, cutoff)
  const inRange = peaks
    .map((peak) => ({ ...peak, frequency: sampleRate / peak.tau }))
    .filter((peak) => peak.frequency >= minFrequency && peak.frequency <= maxFrequency)
  if (inRange.length === 0) return null

  const highest = inRange.reduce((max, peak) => Math.max(max, peak.value), 0)
  const keyMaxima = inRange.filter((peak) => peak.value >= highest * cutoff)
  // Classic MPM: first (lowest frequency? no — first in tau order, i.e. highest freq) key maximum.
  // Peaks are already in increasing-tau order, so the first key maximum is the *highest* pitch
  // among strong peaks, which avoids subharmonics of a clean sine.
  const picked = keyMaxima[0] ?? inRange[0]
  if (!picked) return null
  return {
    frequency: picked.frequency,
    probability: picked.value,
    tau: picked.tau,
    peaks: inRange,
    keyMaxima,
  }
}
