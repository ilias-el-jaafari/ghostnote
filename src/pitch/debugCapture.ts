/** Pack a 10 s mic debug capture as 16-bit PCM WAV + JSON in a store-only ZIP. */

export const DEBUG_CAPTURE_MS = 10_000

export type DebugPitchCandidate = {
  frequency: number
  score: number
  source: string
}

export type DebugPitchFrame = {
  tMs: number
  frequency: number | null
  rawFrequency: number | null
  probability: number
  rms: number
  candidates: DebugPitchCandidate[]
}

export type DebugCaptureMeta = {
  /** AudioContext.sampleRate actually used for analysis and the WAV file. */
  sampleRate: number
  startedAt: string
  durationMs: number
  minFrequency: number
  maxFrequency: number
  windowSamples: number
  lowCutHz: number
  constraints: {
    echoCancellation: boolean
    noiseSuppression: boolean
    autoGainControl: boolean
  }
  /** Values from MediaStreamTrack.getSettings() after applyConstraints. */
  appliedSettings?: {
    echoCancellation?: boolean
    noiseSuppression?: boolean
    autoGainControl?: boolean
    sampleRate?: number
    channelCount?: number
  }
  contextSampleRate?: number
  trackSampleRate?: number
  voiceProcessingOn?: boolean
  userAgent?: string
  frames: DebugPitchFrame[]
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let crc = i
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
    table[i] = crc >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ (data[i] ?? 0)) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i] ?? 0))
    const int = clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff)
    view.setInt16(offset, int, true)
    offset += 2
  }
  return new Uint8Array(buffer)
}

function dosTime(date: Date): { time: number; day: number } {
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f),
    day: (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f),
  }
}

export function zipStore(files: ReadonlyArray<{ name: string; data: Uint8Array }>, date = new Date()): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  const stamp = dosTime(date)
  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name)
    const crc = crc32(file.data)
    const local = new Uint8Array(30 + nameBytes.length + file.data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, stamp.time, true)
    localView.setUint16(12, stamp.day, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, file.data.length, true)
    localView.setUint32(22, file.data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(file.data, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, stamp.time, true)
    centralView.setUint16(14, stamp.day, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, file.data.length, true)
    centralView.setUint32(24, file.data.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)
    offset += local.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let cursor = 0
  for (const part of localParts) {
    out.set(part, cursor)
    cursor += part.length
  }
  for (const part of centralParts) {
    out.set(part, cursor)
    cursor += part.length
  }
  out.set(end, cursor)
  return out
}

export function buildDebugCaptureZip(
  samples: Float32Array,
  meta: DebugCaptureMeta,
  basename = 'ghostnote-mic-debug',
): { zip: Uint8Array; wav: Uint8Array; json: Uint8Array; filename: string } {
  const wav = encodeWavPcm16(samples, meta.sampleRate)
  const json = new TextEncoder().encode(`${JSON.stringify(meta, null, 2)}\n`)
  const zip = zipStore([
    { name: `${basename}.wav`, data: wav },
    { name: `${basename}.json`, data: json },
  ])
  return { zip, wav, json, filename: `${basename}.zip` }
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPhone = /iPad|iPhone|iPod/.test(ua)
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iPhone || iPadOs
}

function toBlob(bytes: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type: mime })
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime = 'application/zip') {
  if (typeof document === 'undefined') return
  const blob = toBlob(bytes, mime)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  // iOS Safari often ignores `download` and would navigate this tab; a new
  // tab lets the user share/save if the attribute does nothing.
  if (isIosSafari()) anchor.target = '_blank'
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } catch {
    /* happy-dom / some WebKit builds throw if they try to open the blob */
  }
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Prefer the Web Share sheet (the reliable way to save a file on iOS Safari),
 * then fall back to an anchor-element download click. Must run in a user-gesture
 * handler — auto-sharing when a timer ends is blocked on iOS.
 */
export async function shareOrDownloadBytes(
  filename: string,
  bytes: Uint8Array,
  mime = 'application/zip',
): Promise<'shared' | 'downloaded'> {
  const blob = toBlob(bytes, mime)
  const file = typeof File === 'function' ? new File([blob], filename, { type: mime }) : undefined
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  if (file && nav && typeof nav.share === 'function') {
    const canShare = typeof nav.canShare !== 'function' || nav.canShare({ files: [file] })
    if (canShare) {
      try {
        await nav.share({ files: [file], title: filename })
        return 'shared'
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return 'shared'
      }
    }
  }
  downloadBytes(filename, bytes, mime)
  return 'downloaded'
}
