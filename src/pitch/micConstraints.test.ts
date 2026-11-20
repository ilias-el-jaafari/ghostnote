import { describe, expect, it, vi } from 'vitest'
import { downloadBytes, shareOrDownloadBytes } from './debugCapture.ts'
import {
  applyMicConstraints,
  MIC_AUDIO_CONSTRAINTS,
  readTrackSettings,
  voiceProcessingStillOn,
} from './micConstraints.ts'

describe('mic constraints', () => {
  it('requests echo cancellation, noise suppression, and AGC off', () => {
    expect(MIC_AUDIO_CONSTRAINTS.echoCancellation).toBe(false)
    expect(MIC_AUDIO_CONSTRAINTS.noiseSuppression).toBe(false)
    expect(MIC_AUDIO_CONSTRAINTS.autoGainControl).toBe(false)
  })

  it('reads and flags applied settings from getSettings()', () => {
    expect(
      voiceProcessingStillOn({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }),
    ).toBe(false)
    expect(voiceProcessingStillOn({ autoGainControl: true, echoCancellation: false })).toBe(true)
    expect(voiceProcessingStillOn({ echoCancellation: undefined })).toBe(false)

    const track = {
      getSettings: () => ({
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
        sampleRate: 44100,
        channelCount: 1,
      }),
    }
    expect(readTrackSettings(track)).toEqual({
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
      sampleRate: 44100,
      channelCount: 1,
    })
  })

  it('retries with exact:false when getSettings still reports processing on', async () => {
    let applyCount = 0
    const track = {
      applyConstraints: vi.fn(async () => {
        applyCount += 1
      }),
      getSettings: () =>
        applyCount <= 1
          ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
    }
    const settings = await applyMicConstraints(track)
    expect(track.applyConstraints).toHaveBeenCalledTimes(2)
    expect(settings.echoCancellation).toBe(false)
    expect(settings.sampleRate).toBe(48000)
    expect(voiceProcessingStillOn(settings)).toBe(false)
  })
})

describe('shareOrDownloadBytes', () => {
  it('uses the Web Share sheet when the browser can share files', async () => {
    const share = vi.fn(async () => undefined)
    const canShare = vi.fn(() => true)
    vi.stubGlobal('navigator', { share, canShare })
    vi.stubGlobal(
      'File',
      class MockFile {
        name: string
        type: string
        constructor(_bits: unknown, name: string, options?: { type?: string }) {
          this.name = name
          this.type = options?.type ?? ''
        }
      },
    )
    const result = await shareOrDownloadBytes('ghostnote-mic-debug.zip', new Uint8Array([1, 2, 3]))
    expect(result).toBe('shared')
    expect(canShare).toHaveBeenCalled()
    expect(share).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('falls back to a download click when share is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const create = vi.fn(() => 'blob:mock')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.fn()
    const anchor = { href: '', download: '', rel: '', target: '', click, remove: vi.fn() }
    const body = { appendChild: vi.fn(), removeChild: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor, body })
    const result = await shareOrDownloadBytes('debug.zip', new Uint8Array([9]))
    expect(result).toBe('downloaded')
    expect(create).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(anchor.download).toBe('debug.zip')
    expect(anchor.target).toBe('')
    vi.unstubAllGlobals()
  })

  it('opens a new tab on iOS Safari when the download attribute may be ignored', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    const create = vi.fn(() => 'blob:mock')
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi.fn()
    const anchor = { href: '', download: '', rel: '', target: '', click, remove: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } })
    const { downloadBytes } = await import('./debugCapture.ts')
    downloadBytes('debug.zip', new Uint8Array([9]))
    expect(anchor.target).toBe('_blank')
    expect(click).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('downloadBytes', () => {
  it('is safe to call when document is missing (unit tests / SSR)', () => {
    expect(() => downloadBytes('x.zip', new Uint8Array([1]))).not.toThrow()
  })
})
