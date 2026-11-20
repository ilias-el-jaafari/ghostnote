/**
 * Shared mix helpers for the guide melody and microphone sensitivity.
 * Pure functions so volume, gates, and normalisation can be tested
 * without Web Audio or the DOM.
 */

export const GUIDE_VOLUME_STORAGE_KEY = 'ghostnote-guide-volume'
export const MIC_SENSITIVITY_STORAGE_KEY = 'ghostnote-mic-sensitivity'

/** Clearly audible default. The old 0.07 / 0.035 cues were easy to miss. */
export const DEFAULT_GUIDE_VOLUME = 0.22

/** Keep the guide sitting on top of a backing track without burying it. */
export const GUIDE_AUDIO_DUCK = 0.85

export const DEFAULT_MIC_SENSITIVITY = 0.75

/** Least-sensitive RMS gate (slider at 0). */
export const MIC_GATE_LOUD = 0.012

/** Most-sensitive RMS gate (slider at 1). About 0.0006 ≈ −64 dBFS peak. */
export const MIC_GATE_QUIET = 0.0006

/** Target RMS used when boosting a quiet mic buffer for YIN. */
export const PITCH_TARGET_RMS = 0.15

/** Do not amplify buffers this quiet — treat them as silence. */
export const PITCH_SILENCE_RMS = 0.0004

/** Cap software auto-gain so noise floors are not turned into fake notes. */
export const PITCH_MAX_GAIN = 64

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function parseStoredUnit(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return clampUnit(parsed)
}

export function readStoredUnit(
  key: string,
  fallback: number,
  storage?: { getItem: (key: string) => string | null },
): number {
  return parseStoredUnit(storage?.getItem(key), fallback)
}

export function persistUnit(
  key: string,
  value: number,
  storage?: { setItem: (key: string, value: string) => void },
) {
  try {
    storage?.setItem(key, String(clampUnit(value)))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/** Peak amplitude for a dBFS value. −30 dBFS → ≈ 0.03162. */
export function amplitudeFromDbfs(dbfs: number): number {
  return 10 ** (dbfs / 20)
}

/**
 * Map a 0–1 sensitivity slider to an RMS gate.
 * Higher sensitivity accepts quieter singing.
 */
export function rmsGateForSensitivity(sensitivity: number): number {
  const t = clampUnit(sensitivity)
  return MIC_GATE_LOUD + (MIC_GATE_QUIET - MIC_GATE_LOUD) * t
}

/** YIN absolute threshold: higher is more lenient. */
export function yinThresholdForSensitivity(sensitivity: number): number {
  return 0.12 + 0.12 * clampUnit(sensitivity)
}

export function yinFallbackForSensitivity(sensitivity: number): number {
  return 0.35 + 0.2 * clampUnit(sensitivity)
}

export function guideGainFor(volume: number, hasAudio: boolean, muted = false): number {
  if (muted) return 0
  return clampUnit(volume) * (hasAudio ? GUIDE_AUDIO_DUCK : 1)
}

export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sumSq = 0
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0
    sumSq += sample * sample
  }
  return Math.sqrt(sumSq / samples.length)
}

/**
 * Boost a quiet buffer toward `targetRms` (software auto-gain).
 * Loud buffers are left alone. Silence below `silenceRms` is unchanged.
 */
export function normalizeToRms(
  samples: Float32Array,
  targetRms = PITCH_TARGET_RMS,
  silenceRms = PITCH_SILENCE_RMS,
  maxGain = PITCH_MAX_GAIN,
): Float32Array {
  const rms = computeRms(samples)
  if (rms <= silenceRms || !(targetRms > 0)) return samples
  const scale = Math.min(maxGain, targetRms / rms)
  if (scale <= 1) return samples
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = (samples[i] ?? 0) * scale
  }
  return out
}

/** In-place boost used on the live analyser buffer after RMS is measured. */
export function boostInPlace(
  samples: Float32Array,
  targetRms = PITCH_TARGET_RMS,
  silenceRms = PITCH_SILENCE_RMS,
  maxGain = PITCH_MAX_GAIN,
): number {
  const rms = computeRms(samples)
  if (rms <= silenceRms || !(targetRms > 0)) return rms
  const scale = Math.min(maxGain, targetRms / rms)
  if (scale > 1) {
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = (samples[i] ?? 0) * scale
    }
  }
  return rms
}

export const DEFAULT_MIC_MIN_RMS = rmsGateForSensitivity(DEFAULT_MIC_SENSITIVITY)
