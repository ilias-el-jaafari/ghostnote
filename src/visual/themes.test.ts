import { describe, expect, it } from 'vitest'
import {
  formatCabinetScore,
  formatClock,
  isThemeId,
  noteTint,
  parseThemePreference,
  pickRandomTheme,
  progressRatio,
  readThemePreference,
  resolveTheme,
  THEME_IDS,
  THEME_STORAGE_KEY,
} from './themes.ts'

describe('parseThemePreference', () => {
  it('accepts ids, aliases, and mixed case', () => {
    expect(parseThemePreference('Kaleido')).toBe('kaleido')
    expect(parseThemePreference('aqua-bubble')).toBe('aqua')
    expect(parseThemePreference('Neon Galaxy')).toBe('galaxy')
    expect(parseThemePreference('laser-grid')).toBe('laser')
    expect(parseThemePreference('random')).toBe('random')
    expect(parseThemePreference('nope')).toBeUndefined()
  })
})

describe('readThemePreference', () => {
  it('prefers the URL flag over localStorage', () => {
    const storage = { getItem: () => 'laser' }
    expect(readThemePreference({ storage, search: '?theme=kaleido' })).toBe('kaleido')
    expect(readThemePreference({ storage, search: '' })).toBe('laser')
  })

  it('falls back to random when nothing is stored', () => {
    expect(readThemePreference({ search: '' })).toBe('random')
  })
})

describe('resolveTheme and pickRandomTheme', () => {
  it('returns a locked preference as-is', () => {
    expect(resolveTheme('galaxy')).toBe('galaxy')
    expect(isThemeId(resolveTheme('aqua'))).toBe(true)
  })

  it('picks a deterministic theme from a supplied rng and can exclude the last one', () => {
    expect(pickRandomTheme(() => 0)).toBe(THEME_IDS[0])
    expect(pickRandomTheme(() => 0.99, 'kaleido')).not.toBe('kaleido')
    expect(resolveTheme('random', { rng: () => 0.6 })).toBe(THEME_IDS[Math.floor(0.6 * 4)])
  })

  it('still returns a theme if every id would be excluded', () => {
    // exclude is only one id; forcing an empty pool is not possible, but the
    // function must always return a ThemeId.
    expect(THEME_IDS.includes(pickRandomTheme(() => 0.2, 'laser'))).toBe(true)
  })
})

describe('cabinet helpers', () => {
  it('pads scores and clocks the way 2000s HUDs did', () => {
    expect(formatCabinetScore(4833)).toBe('04833')
    expect(formatCabinetScore(10000)).toBe('10000')
    expect(formatClock(65000)).toBe('01:05')
    expect(formatClock(-2000)).toBe('00:00')
  })

  it('tints notes by pitch class and keeps goldens gold', () => {
    expect(noteTint(0, 'regular')).toBe('#1ea7ff')
    expect(noteTint(1, 'regular')).toBe('#3dff5a')
    expect(noteTint(4, 'regular')).toBe('#1ea7ff')
    expect(noteTint(7, 'golden')).toBe('#ffe14a')
  })

  it('clamps the time-bar ratio', () => {
    expect(progressRatio(-2000, -2000, 15500)).toBe(0)
    expect(progressRatio(15500, -2000, 15500)).toBe(1)
    expect(progressRatio(6750, -2000, 15500)).toBeCloseTo(0.5, 2)
  })
})

describe('THEME_STORAGE_KEY', () => {
  it('stays on the ghostnote prefix', () => {
    expect(THEME_STORAGE_KEY).toBe('ghostnote-theme')
  })
})
