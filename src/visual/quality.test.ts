import { describe, expect, it } from 'vitest'
import {
  chooseVisualQuality,
  downgradeQuality,
  parseQualityOverride,
  readQualityHints,
  settingsFor,
} from './quality.ts'

describe('parseQualityOverride', () => {
  it('accepts known tiers and maps off to static', () => {
    expect(parseQualityOverride('high')).toBe('high')
    expect(parseQualityOverride('off')).toBe('static')
    expect(parseQualityOverride('nope')).toBe('auto')
    expect(parseQualityOverride(undefined)).toBe('auto')
  })
})

describe('chooseVisualQuality', () => {
  it('honours an explicit override even when motion is reduced', () => {
    expect(
      chooseVisualQuality({
        webgl: false,
        prefersReducedMotion: true,
        override: 'high',
      }),
    ).toBe('high')
  })

  it('goes static when the user prefers reduced motion', () => {
    expect(chooseVisualQuality({ webgl: true, prefersReducedMotion: true })).toBe('static')
  })

  it('goes static when WebGL is missing', () => {
    expect(chooseVisualQuality({ webgl: false, prefersReducedMotion: false })).toBe('static')
  })

  it('drops to low on a weak phone and medium on a mid-range one', () => {
    expect(
      chooseVisualQuality({
        webgl: true,
        prefersReducedMotion: false,
        hardwareConcurrency: 2,
        deviceMemory: 2,
      }),
    ).toBe('low')
    expect(
      chooseVisualQuality({
        webgl: true,
        prefersReducedMotion: false,
        hardwareConcurrency: 4,
        deviceMemory: 4,
      }),
    ).toBe('medium')
  })

  it('stays high on a capable device and downgrades if FPS is poor', () => {
    expect(
      chooseVisualQuality({
        webgl: true,
        prefersReducedMotion: false,
        hardwareConcurrency: 8,
        deviceMemory: 8,
      }),
    ).toBe('high')
    expect(
      chooseVisualQuality({
        webgl: true,
        prefersReducedMotion: false,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        fps: 20,
      }),
    ).toBe('medium')
  })
})

describe('settingsFor', () => {
  it('disables the shader and particles in the static tier', () => {
    const settings = settingsFor('static', true)
    expect(settings.useWebGL).toBe(false)
    expect(settings.particles).toBe(false)
    expect(settings.animateBackground).toBe(false)
    expect(settings.waveform).toBe(true)
  })

  it('keeps flares on low but drops particle bursts', () => {
    const settings = settingsFor('low', true)
    expect(settings.useWebGL).toBe(true)
    expect(settings.shaderScale).toBeLessThan(0.5)
    expect(settings.particles).toBe(false)
    expect(settings.flares).toBe(true)
  })

  it('does not enable WebGL when the context is missing', () => {
    expect(settingsFor('high', false).useWebGL).toBe(false)
  })
})

describe('downgradeQuality', () => {
  it('steps down one tier at a time and stops at static', () => {
    expect(downgradeQuality('high')).toBe('medium')
    expect(downgradeQuality('medium')).toBe('low')
    expect(downgradeQuality('low')).toBe('static')
    expect(downgradeQuality('static')).toBe('static')
  })
})

describe('readQualityHints', () => {
  it('reads the visual query flag and reduced-motion media query', () => {
    const hints = readQualityHints({
      hasWebGL: () => true,
      matchMedia: (query) => ({ matches: query.includes('prefers-reduced-motion') }),
      navigator: { hardwareConcurrency: 4, deviceMemory: 3 },
      search: '?visual=low',
    })
    expect(hints.override).toBe('low')
    expect(hints.prefersReducedMotion).toBe(true)
    expect(hints.hardwareConcurrency).toBe(4)
  })
})
