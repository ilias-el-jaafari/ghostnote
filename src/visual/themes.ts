/**
 * Switchable 2000s visual themes for GhostNote.
 * Pure functions so preference, resolution, and randomisation can be tested
 * without WebGL or the DOM.
 */

export const THEME_IDS = ['kaleido', 'aqua', 'galaxy', 'laser'] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_PREFERENCES = [...THEME_IDS, 'random'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const THEME_STORAGE_KEY = 'ghostnote-theme'

/** Classic 2000s cabinet player colours, in moodboard order. */
export const PLAYER_PALETTE = ['#1ea7ff', '#3dff5a', '#ff3de8', '#ffe14a'] as const

export type ThemeDefinition = {
  id: ThemeId
  /** Shader branch: 0 kaleido, 1 aqua, 2 galaxy, 3 laser. */
  shaderMode: number
  nameKey: 'theme.kaleido' | 'theme.aqua' | 'theme.galaxy' | 'theme.laser'
  laneStyle: 'flat' | 'perspective'
  /** Saturated CSS fallback when WebGL is missing. */
  fallback: string
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  kaleido: {
    id: 'kaleido',
    shaderMode: 0,
    nameKey: 'theme.kaleido',
    laneStyle: 'flat',
    fallback:
      'radial-gradient(circle at 30% 20%, #ff4de8 0%, transparent 42%), radial-gradient(circle at 80% 10%, #3dff9a 0%, transparent 40%), radial-gradient(circle at 50% 80%, #7a1cff 0%, transparent 50%), linear-gradient(180deg, #2a0066, #0a0018)',
  },
  aqua: {
    id: 'aqua',
    shaderMode: 1,
    nameKey: 'theme.aqua',
    laneStyle: 'flat',
    fallback:
      'radial-gradient(circle at 20% 15%, #fff 0%, #7ef0ff 18%, transparent 42%), radial-gradient(circle at 80% 20%, #ff9ad8 0%, transparent 40%), linear-gradient(180deg, #4ee0ff, #1378c8 45%, #05244a)',
  },
  galaxy: {
    id: 'galaxy',
    shaderMode: 2,
    nameKey: 'theme.galaxy',
    laneStyle: 'perspective',
    fallback:
      'radial-gradient(circle at 70% 30%, #ff7ad9 0%, transparent 28%), radial-gradient(circle at 30% 60%, #4d7cff 0%, transparent 35%), linear-gradient(180deg, #140028, #000010)',
  },
  laser: {
    id: 'laser',
    shaderMode: 3,
    nameKey: 'theme.laser',
    laneStyle: 'perspective',
    fallback:
      'linear-gradient(180deg, #1a0030 0%, #0a0018 40%, #2a0055 100%), repeating-linear-gradient(to right, transparent 0 46px, rgba(255, 0, 220, 0.25) 46px 48px)',
  },
}

const ALIASES: Record<string, ThemePreference> = {
  kaleido: 'kaleido',
  kaleidoscope: 'kaleido',
  psychedelic: 'kaleido',
  aqua: 'aqua',
  'aqua-bubble': 'aqua',
  aquabubble: 'aqua',
  bubble: 'aqua',
  galaxy: 'galaxy',
  'neon-galaxy': 'galaxy',
  neongalaxy: 'galaxy',
  neon: 'galaxy',
  laser: 'laser',
  'laser-grid': 'laser',
  lasergrid: 'laser',
  grid: 'laser',
  random: 'random',
  auto: 'random',
}

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value === 'kaleido' || value === 'aqua' || value === 'galaxy' || value === 'laser'
}

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return isThemeId(value) || value === 'random'
}

export function parseThemePreference(value: string | null | undefined): ThemePreference | undefined {
  if (!value) return undefined
  const key = value.trim().toLowerCase().replaceAll(' ', '-')
  return ALIASES[key]
}

export function readThemePreference(input: {
  storage?: { getItem: (key: string) => string | null }
  search?: string
  fallback?: ThemePreference
}): ThemePreference {
  const params = new URLSearchParams(input.search ?? '')
  const fromUrl = parseThemePreference(params.get('theme'))
  if (fromUrl) return fromUrl
  const stored = parseThemePreference(input.storage?.getItem(THEME_STORAGE_KEY))
  if (stored) return stored
  return input.fallback ?? 'random'
}

export function persistThemePreference(
  preference: ThemePreference,
  storage?: { setItem: (key: string, value: string) => void },
) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function pickRandomTheme(
  rng: () => number = Math.random,
  exclude?: ThemeId,
): ThemeId {
  const pool = THEME_IDS.filter((id) => id !== exclude)
  const list = pool.length > 0 ? pool : THEME_IDS
  const index = Math.floor(rng() * list.length) % list.length
  return list[index] ?? 'kaleido'
}

/**
 * Resolve a stored preference to a concrete theme.
 * `random` picks a theme, optionally avoiding the previous one, using `rng` when given.
 */
export function resolveTheme(
  preference: ThemePreference,
  options: { rng?: () => number; exclude?: ThemeId } = {},
): ThemeId {
  if (preference !== 'random') return preference
  return pickRandomTheme(options.rng, options.exclude)
}

/** Map an UltraStar pitch to a saturated cabinet colour (goldens stay gold). */
export function noteTint(pitch: number, type: string): string {
  if (type === 'golden' || type === 'goldenRap') return '#ffe14a'
  if (type === 'freestyle') return '#c8c8d0'
  const index = ((pitch % PLAYER_PALETTE.length) + PLAYER_PALETTE.length) % PLAYER_PALETTE.length
  return PLAYER_PALETTE[index] ?? PLAYER_PALETTE[0]
}

/** UltraStar-style five-digit score pad, e.g. 04833. */
export function formatCabinetScore(score: number, width = 5): string {
  const clamped = Math.max(0, Math.round(score))
  return String(clamped).padStart(width, '0')
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function progressRatio(timeMs: number, startMs: number, endMs: number): number {
  const span = endMs - startMs
  if (!(span > 0)) return 0
  const ratio = (timeMs - startMs) / span
  return Math.min(1, Math.max(0, ratio))
}
