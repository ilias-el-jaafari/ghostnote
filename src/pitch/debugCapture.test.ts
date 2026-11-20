import { describe, expect, it } from 'vitest'
import {
  buildDebugCaptureZip,
  crc32,
  encodeWavPcm16,
  zipStore,
  type DebugCaptureMeta,
} from './debugCapture.ts'

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

describe('encodeWavPcm16', () => {
  it('writes a mono 16-bit PCM header for the given sample rate', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const wav = encodeWavPcm16(samples, 48_000)
    expect(readAscii(wav, 0, 4)).toBe('RIFF')
    expect(readAscii(wav, 8, 4)).toBe('WAVE')
    expect(readAscii(wav, 12, 4)).toBe('fmt ')
    const view = new DataView(wav.buffer)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(48_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(samples.length * 2)
    expect(wav.length).toBe(44 + samples.length * 2)
  })
})

describe('zipStore', () => {
  it('packs named files with a valid local + central header and matching CRC', () => {
    const hello = new TextEncoder().encode('hello')
    const zip = zipStore([{ name: 'note.txt', data: hello }])
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034b50)
    expect(crc32(hello)).toBe(0x3610a686)
    expect(readAscii(zip, 30, 8)).toBe('note.txt')
    expect(new TextDecoder().decode(zip.subarray(38, 43))).toBe('hello')
  })
})

describe('buildDebugCaptureZip', () => {
  it('includes a wav and a json of the pitch frames', () => {
    const samples = new Float32Array(480).map((_, i) => Math.sin((2 * Math.PI * i) / 48))
    const meta: DebugCaptureMeta = {
      sampleRate: 48000,
      startedAt: '2026-11-20T18:00:00.000Z',
      durationMs: 10,
      minFrequency: 70,
      maxFrequency: 1000,
      windowSamples: 4096,
      lowCutHz: 60,
      constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      frames: [
        { tMs: 0, frequency: 110, rawFrequency: 220, probability: 0.8, rms: 0.1, candidates: [] },
      ],
    }
    const built = buildDebugCaptureZip(samples, meta, 'ghostnote-mic-debug')
    expect(built.filename).toBe('ghostnote-mic-debug.zip')
    expect(built.wav.length).toBeGreaterThan(44)
    const json = JSON.parse(new TextDecoder().decode(built.json)) as DebugCaptureMeta
    expect(json.frames[0]?.frequency).toBe(110)
    expect(json.frames[0]?.rawFrequency).toBe(220)
    const names = new TextDecoder().decode(built.zip)
    expect(names).toContain('ghostnote-mic-debug.wav')
    expect(names).toContain('ghostnote-mic-debug.json')
  })
})
