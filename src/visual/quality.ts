/**
 * Visual quality tiers and capability detection for the Frutiger Aero stage.
 * Pure functions so they can be unit-tested without WebGL or the DOM.
 */

export const QUALITY_TIERS = ['high', 'medium', 'low', 'static'] as const
export type VisualQuality = (typeof QUALITY_TIERS)[number]

export type QualityHints = {
  webgl: boolean
  prefersReducedMotion: boolean
  hardwareConcurrency?: number
  deviceMemory?: number
  /** Rolling average frames-per-second, if already measured. */
  fps?: number
  /** URL / debug override. `auto` leaves detection in charge. */
  override?: VisualQuality | 'auto'
}

export type QualitySettings = {
  quality: VisualQuality
  useWebGL: boolean
  /** Back-buffer scale relative to CSS pixels (1, 0.5, 0.33, 0). */
  shaderScale: number
  fractalOctaves: number
  particles: boolean
  flares: boolean
  animateBackground: boolean
  waveform: boolean
  maxParticles: number
}

const LOW_FPS = 28
const HIGH_CORES = 6
const HIGH_MEMORY = 6
const MEDIUM_CORES = 4
const MEDIUM_MEMORY = 4
const LOW_CORES = 2
const LOW_MEMORY = 2

export function isQuality(value: string | null | undefined): value is VisualQuality {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'static'
}

export function parseQualityOverride(value: string | null | undefined): VisualQuality | 'auto' {
  if (value === 'off') return 'static'
  if (isQuality(value)) return value
  return 'auto'
}

/**
 * Pick a quality tier from static device hints. Runtime FPS can later drop the
 * tier via `downgradeQuality` — never upgrade past what this function chose,
 * except when an explicit override is set.
 */
export function chooseVisualQuality(hints: QualityHints): VisualQuality {
  if (hints.override && hints.override !== 'auto') return hints.override
  if (hints.prefersReducedMotion) return 'static'
  if (!hints.webgl) return 'static'

  const cores = hints.hardwareConcurrency ?? 8
  const memory = hints.deviceMemory ?? 8
  let quality: VisualQuality = 'high'
  if (cores <= LOW_CORES || memory <= LOW_MEMORY) quality = 'low'
  else if (cores <= MEDIUM_CORES || memory <= MEDIUM_MEMORY) quality = 'medium'
  else if (cores < HIGH_CORES && memory < HIGH_MEMORY) quality = 'medium'

  if (hints.fps !== undefined && hints.fps < LOW_FPS) {
    return downgradeQuality(quality)
  }
  return quality
}

export function downgradeQuality(quality: VisualQuality): VisualQuality {
  if (quality === 'high') return 'medium'
  if (quality === 'medium') return 'low'
  return 'static'
}

export function settingsFor(quality: VisualQuality, webgl: boolean): QualitySettings {
  const useWebGL = webgl && quality !== 'static'
  switch (quality) {
    case 'high':
      return {
        quality,
        useWebGL,
        shaderScale: 1,
        fractalOctaves: 5,
        particles: true,
        flares: true,
        animateBackground: true,
        waveform: true,
        maxParticles: 180,
      }
    case 'medium':
      return {
        quality,
        useWebGL,
        shaderScale: 0.5,
        fractalOctaves: 3,
        particles: true,
        flares: true,
        animateBackground: true,
        waveform: true,
        maxParticles: 90,
      }
    case 'low':
      return {
        quality,
        useWebGL,
        shaderScale: 0.33,
        fractalOctaves: 2,
        particles: false,
        flares: true,
        animateBackground: true,
        waveform: true,
        maxParticles: 0,
      }
    case 'static':
      return {
        quality,
        useWebGL: false,
        shaderScale: 0,
        fractalOctaves: 0,
        particles: false,
        flares: false,
        animateBackground: false,
        waveform: true,
        maxParticles: 0,
      }
  }
}

export function readQualityHints(input: {
  hasWebGL: () => boolean
  matchMedia?: (query: string) => { matches: boolean }
  navigator?: { hardwareConcurrency?: number; deviceMemory?: number }
  search?: string
}): QualityHints {
  const params = new URLSearchParams(input.search ?? '')
  const media = input.matchMedia?.('(prefers-reduced-motion: reduce)')
  return {
    webgl: input.hasWebGL(),
    prefersReducedMotion: media?.matches ?? false,
    hardwareConcurrency: input.navigator?.hardwareConcurrency,
    deviceMemory: input.navigator?.deviceMemory,
    override: parseQualityOverride(params.get('visual')),
  }
}

export function detectWebGL(canvas: { getContext: (id: string) => unknown } | undefined): boolean {
  if (!canvas) return false
  try {
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return Boolean(context)
  } catch {
    return false
  }
}
