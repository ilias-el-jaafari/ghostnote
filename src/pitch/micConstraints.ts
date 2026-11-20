/**
 * Phone and laptop voice-processing (especially iOS Safari) high-passes or
 * flattens low sung fundamentals. Always request these off, then verify with
 * track.getSettings() — Safari may ignore a constraint until applyConstraints.
 */
export const MIC_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
} as const

export type MicProcessingSettings = {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  sampleRate?: number
  channelCount?: number
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readTrackSettings(track: Pick<MediaStreamTrack, 'getSettings'>): MicProcessingSettings {
  const settings = track.getSettings()
  return {
    echoCancellation: asBoolean(settings.echoCancellation),
    noiseSuppression: asBoolean(settings.noiseSuppression),
    autoGainControl: asBoolean(settings.autoGainControl),
    sampleRate: asNumber(settings.sampleRate),
    channelCount: asNumber(settings.channelCount),
  }
}

export function voiceProcessingStillOn(settings: MicProcessingSettings): boolean {
  return (
    settings.echoCancellation === true ||
    settings.noiseSuppression === true ||
    settings.autoGainControl === true
  )
}

const EXACT_OFF = {
  echoCancellation: { exact: false },
  noiseSuppression: { exact: false },
  autoGainControl: { exact: false },
} as const

export async function applyMicConstraints(
  track: Pick<MediaStreamTrack, 'applyConstraints' | 'getSettings'>,
): Promise<MicProcessingSettings> {
  try {
    await track.applyConstraints({ ...MIC_AUDIO_CONSTRAINTS })
  } catch {
    /* OverconstrainedError — try the exact-false form used by some WebKit builds */
  }
  let settings = readTrackSettings(track)
  if (voiceProcessingStillOn(settings)) {
    try {
      await track.applyConstraints({ ...EXACT_OFF })
    } catch {
      /* leave the previous settings in place */
    }
    settings = readTrackSettings(track)
  }
  return settings
}

/** Set a power-of-two fftSize, walking down if WebKit rejects the request. */
export function setAnalyserWindow(analyser: AnalyserNode, requested: number): number {
  let size = requested
  while (size >= 32) {
    try {
      analyser.fftSize = size
      if (analyser.fftSize === size) return size
    } catch {
      /* unsupported size */
    }
    size = Math.floor(size / 2)
  }
  return analyser.fftSize
}

/**
 * Read a time-domain analyser frame. Older WebKit only had the byte API.
 * Uses the analyser's actual fftSize, never an assumed sample rate.
 */
export function readTimeDomain(analyser: AnalyserNode, buffer: Float32Array) {
  if (typeof analyser.getFloatTimeDomainData === 'function') {
    analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>)
    return
  }
  const bytes = new Uint8Array(analyser.fftSize)
  analyser.getByteTimeDomainData(bytes)
  const length = Math.min(buffer.length, bytes.length)
  for (let i = 0; i < length; i += 1) {
    buffer[i] = ((bytes[i] ?? 128) - 128) / 128
  }
}
