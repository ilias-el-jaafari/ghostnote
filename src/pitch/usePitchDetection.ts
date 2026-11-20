import { useCallback, useEffect, useRef, useState } from 'react'
import {
  boostInPlace,
  DEFAULT_MIC_MIN_RMS,
  DEFAULT_MIC_SENSITIVITY,
  rmsGateForSensitivity,
  yinFallbackForSensitivity,
  yinThresholdForSensitivity,
} from '../audio/mix.ts'
import {
  buildDebugCaptureZip,
  DEBUG_CAPTURE_MS,
  shareOrDownloadBytes,
  type DebugCaptureMeta,
  type DebugPitchFrame,
} from './debugCapture.ts'
import { detectPitch } from './detect.ts'
import {
  applyMicConstraints,
  MIC_AUDIO_CONSTRAINTS,
  setAnalyserWindow,
  readTimeDomain,
  voiceProcessingStillOn,
  type MicProcessingSettings,
} from './micConstraints.ts'
import { frequencyToNoteName, type NamedNote } from './note.ts'
import { OctaveHysteresis } from './smooth.ts'
import {
  DEFAULT_MAX_PITCH_HZ,
  DEFAULT_MIN_PITCH_HZ,
  pitchWindowSamples,
} from './yin.ts'

export type MicStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'denied'
  | 'unsupported'
  | 'error'

export type LivePitch = {
  frequency: number | null
  note: NamedNote | null
  probability: number
  rms: number
}

export type MicErrorCode = 'unsupported' | 'denied' | 'notFound' | 'startFailed'

export type DebugCaptureStatus = 'idle' | 'recording' | 'ready'

export type DebugCaptureBundle = {
  filename: string
  zip: Uint8Array
  startedAt: string
}

export type MicDiagnostics = {
  contextSampleRate: number
  trackSampleRate?: number
  fftSize: number
  lowCutHz: number
  settings: MicProcessingSettings
  requested: typeof MIC_AUDIO_CONSTRAINTS
  voiceProcessingOn: boolean
}

/** Default gate at the default sensitivity. Prefer `rmsGateForSensitivity`. */
export const MIC_MIN_RMS = DEFAULT_MIC_MIN_RMS

export { MIC_AUDIO_CONSTRAINTS } from './micConstraints.ts'

/** Analysis-only high-pass; do not cut into a low tenor/bass fundamental. */
export const ANALYSIS_HIGHPASS_HZ = 60

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || window.webkitAudioContext
}

type CaptureSession = {
  startedAtMs: number
  startedAtIso: string
  durationMs: number
  lastTime: number
  offset: number
  samples: Float32Array
  frames: DebugPitchFrame[]
  sampleRate: number
  windowSamples: number
}

export function usePitchDetection(sensitivity = DEFAULT_MIC_SENSITIVITY) {
  const sensitivityRef = useRef(sensitivity)
  const [status, setStatus] = useState<MicStatus>('idle')
  const [errorCode, setErrorCode] = useState<MicErrorCode | undefined>(undefined)
  const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined)
  const [live, setLive] = useState<LivePitch>({
    frequency: null,
    note: null,
    probability: 0,
    rms: 0,
  })
  const [debugStatus, setDebugStatus] = useState<DebugCaptureStatus>('idle')
  const [debugRemainingMs, setDebugRemainingMs] = useState(0)
  const [debugBundle, setDebugBundle] = useState<DebugCaptureBundle | undefined>(undefined)
  const [diagnostics, setDiagnostics] = useState<MicDiagnostics | undefined>(undefined)

  const audioRef = useRef<AudioContext | undefined>(undefined)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const analyserRef = useRef<AnalyserNode | undefined>(undefined)
  const rawAnalyserRef = useRef<AnalyserNode | undefined>(undefined)
  const highpassRef = useRef<BiquadFilterNode | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const bufferRef = useRef<Float32Array<ArrayBuffer> | undefined>(undefined)
  const rawBufferRef = useRef<Float32Array<ArrayBuffer> | undefined>(undefined)
  const smootherRef = useRef(new OctaveHysteresis())
  const captureRef = useRef<CaptureSession | undefined>(undefined)
  const diagnosticsRef = useRef<MicDiagnostics | undefined>(undefined)
  const unlockRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    sensitivityRef.current = sensitivity
  }, [sensitivity])

  const stopLoop = useCallback(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }
  }, [])

  const detachUnlock = useCallback(() => {
    if (!unlockRef.current) return
    const resume = unlockRef.current
    unlockRef.current = undefined
    document.removeEventListener('touchstart', resume)
    document.removeEventListener('pointerdown', resume)
    document.removeEventListener('visibilitychange', resume)
  }, [])

  const finishCapture = useCallback((session: CaptureSession) => {
    const samples = session.samples.subarray(0, session.offset)
    const diag = diagnosticsRef.current
    const meta: DebugCaptureMeta = {
      sampleRate: session.sampleRate,
      startedAt: session.startedAtIso,
      durationMs: Math.round((session.offset / session.sampleRate) * 1000),
      minFrequency: DEFAULT_MIN_PITCH_HZ,
      maxFrequency: DEFAULT_MAX_PITCH_HZ,
      windowSamples: session.windowSamples,
      lowCutHz: ANALYSIS_HIGHPASS_HZ,
      constraints: { ...MIC_AUDIO_CONSTRAINTS },
      appliedSettings: diag?.settings,
      contextSampleRate: session.sampleRate,
      trackSampleRate: diag?.trackSampleRate,
      voiceProcessingOn: diag?.voiceProcessingOn,
      userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
      frames: session.frames,
    }
    const stamp = session.startedAtIso.replace(/[:.]/g, '-').slice(0, 19)
    const built = buildDebugCaptureZip(samples, meta, `ghostnote-mic-debug-${stamp}`)
    const bundle = { filename: built.filename, zip: built.zip, startedAt: session.startedAtIso }
    setDebugBundle(bundle)
    setDebugStatus('ready')
    setDebugRemainingMs(0)
    return bundle
  }, [])

  const stop = useCallback(async () => {
    stopLoop()
    detachUnlock()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
    highpassRef.current?.disconnect()
    highpassRef.current = undefined
    analyserRef.current?.disconnect()
    analyserRef.current = undefined
    rawAnalyserRef.current?.disconnect()
    rawAnalyserRef.current = undefined
    bufferRef.current = undefined
    rawBufferRef.current = undefined
    if (audioRef.current) {
      await audioRef.current.close().catch(() => undefined)
      audioRef.current = undefined
    }
    smootherRef.current.reset()
    const open = captureRef.current
    captureRef.current = undefined
    if (open && open.offset > 0) finishCapture(open)
    else if (open) {
      setDebugStatus('idle')
      setDebugRemainingMs(0)
    }
    setLive({ frequency: null, note: null, probability: 0, rms: 0 })
    setDiagnostics(undefined)
    diagnosticsRef.current = undefined
    setStatus('idle')
  }, [stopLoop, finishCapture, detachUnlock])

  const start = useCallback(async () => {
    const AudioContextCtor = getAudioContextConstructor()
    if (
      !AudioContextCtor ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus('unsupported')
      setErrorCode('unsupported')
      setErrorDetail(undefined)
      return
    }

    smootherRef.current.reset()
    setErrorCode(undefined)
    setErrorDetail(undefined)
    setStatus('requesting')

    try {
      // Create + resume the context in the same user-gesture as the tap.
      // iOS Safari suspends contexts created after an awaited getUserMedia.
      const context = new AudioContextCtor()
      audioRef.current = context
      if (context.state === 'suspended') {
        await context.resume()
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...MIC_AUDIO_CONSTRAINTS },
        video: false,
      })
      streamRef.current = stream
      if (context.state === 'suspended') {
        await context.resume()
      }

      const track = stream.getAudioTracks()[0]
      const settings = track ? await applyMicConstraints(track) : {}
      const fftRequested = pitchWindowSamples(context.sampleRate, DEFAULT_MIN_PITCH_HZ)
      const source = context.createMediaStreamSource(stream)
      const rawAnalyser = context.createAnalyser()
      const fftSize = setAnalyserWindow(rawAnalyser, fftRequested)
      const highpass = context.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = ANALYSIS_HIGHPASS_HZ
      highpass.Q.value = Math.SQRT1_2
      const analyser = context.createAnalyser()
      setAnalyserWindow(analyser, fftSize)
      source.connect(rawAnalyser)
      source.connect(highpass)
      highpass.connect(analyser)
      analyserRef.current = analyser
      rawAnalyserRef.current = rawAnalyser
      highpassRef.current = highpass
      bufferRef.current = new Float32Array(fftSize)
      rawBufferRef.current = new Float32Array(fftSize)

      const diag: MicDiagnostics = {
        contextSampleRate: context.sampleRate,
        trackSampleRate: settings.sampleRate,
        fftSize,
        lowCutHz: ANALYSIS_HIGHPASS_HZ,
        settings,
        requested: MIC_AUDIO_CONSTRAINTS,
        voiceProcessingOn: voiceProcessingStillOn(settings),
      }
      diagnosticsRef.current = diag
      setDiagnostics(diag)

      const resumeIfNeeded = () => {
        if (audioRef.current?.state === 'suspended') {
          void audioRef.current.resume()
        }
      }
      detachUnlock()
      unlockRef.current = resumeIfNeeded
      document.addEventListener('touchstart', resumeIfNeeded)
      document.addEventListener('pointerdown', resumeIfNeeded)
      document.addEventListener('visibilitychange', resumeIfNeeded)

      const loop = () => {
        const activeAnalyser = analyserRef.current
        const rawAnalyserNow = rawAnalyserRef.current
        const activeContext = audioRef.current
        const buffer = bufferRef.current
        const rawBuffer = rawBufferRef.current
        if (!activeAnalyser || !rawAnalyserNow || !activeContext || !buffer || !rawBuffer) return

        readTimeDomain(rawAnalyserNow, rawBuffer)
        readTimeDomain(activeAnalyser, buffer)
        const sensitivityNow = sensitivityRef.current
        const minRms = rmsGateForSensitivity(sensitivityNow)
        const rawRms = boostInPlace(buffer)
        const result =
          rawRms >= minRms
            ? detectPitch(buffer, {
                sampleRate: activeContext.sampleRate,
                minFrequency: DEFAULT_MIN_PITCH_HZ,
                maxFrequency: DEFAULT_MAX_PITCH_HZ,
                minRms: minRms,
                threshold: yinThresholdForSensitivity(sensitivityNow),
                fallbackThreshold: yinFallbackForSensitivity(sensitivityNow),
              })
            : null

        const frequency = smootherRef.current.push(result?.frequency ?? null)
        if (frequency) {
          setLive({
            frequency,
            note: frequencyToNoteName(frequency),
            probability: result?.probability ?? 0,
            rms: rawRms,
          })
        } else {
          setLive({
            frequency: null,
            note: null,
            probability: 0,
            rms: rawRms,
          })
        }

        const capture = captureRef.current
        if (capture) {
          const now = activeContext.currentTime
          const elapsedSec = Math.max(0, now - capture.lastTime)
          const newSamples = Math.min(
            rawBuffer.length,
            Math.max(0, Math.round(elapsedSec * capture.sampleRate)),
          )
          if (newSamples > 0 && capture.offset < capture.samples.length) {
            const startIndex = rawBuffer.length - newSamples
            const room = capture.samples.length - capture.offset
            const copyCount = Math.min(newSamples, room)
            capture.samples.set(rawBuffer.subarray(startIndex, startIndex + copyCount), capture.offset)
            capture.offset += copyCount
          }
          capture.lastTime = now
          capture.frames.push({
            tMs: Math.round(now * 1000 - capture.startedAtMs),
            frequency,
            rawFrequency: result?.rawFrequency ?? result?.frequency ?? null,
            probability: result?.probability ?? 0,
            rms: rawRms,
            candidates: result?.candidates ?? [],
          })
          const remaining = capture.durationMs - (now * 1000 - capture.startedAtMs)
          setDebugRemainingMs(Math.max(0, Math.round(remaining)))
          if (remaining <= 0 || capture.offset >= capture.samples.length) {
            captureRef.current = undefined
            finishCapture(capture)
          }
        }

        frameRef.current = requestAnimationFrame(loop)
      }

      setStatus('listening')
      frameRef.current = requestAnimationFrame(loop)
    } catch (error) {
      await stop()
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('denied')
        setErrorCode('denied')
        setErrorDetail(undefined)
        return
      }
      if (name === 'NotFoundError') {
        setStatus('error')
        setErrorCode('notFound')
        setErrorDetail(undefined)
        return
      }
      setStatus('error')
      setErrorCode('startFailed')
      setErrorDetail(error instanceof Error ? error.message : undefined)
    }
  }, [stop, finishCapture, detachUnlock])

  const startDebugCapture = useCallback(
    async (durationMs = DEBUG_CAPTURE_MS) => {
      if (audioRef.current?.state === 'suspended') {
        await audioRef.current.resume()
      }
      if (status !== 'listening') {
        await start()
      }
      const context = audioRef.current
      if (!context) return
      if (context.state === 'suspended') {
        await context.resume()
      }
      const windowSize = bufferRef.current?.length ?? pitchWindowSamples(context.sampleRate)
      const capacity = Math.ceil((context.sampleRate * durationMs) / 1000)
      captureRef.current = {
        startedAtMs: context.currentTime * 1000,
        startedAtIso: new Date().toISOString(),
        durationMs,
        lastTime: context.currentTime,
        offset: 0,
        samples: new Float32Array(capacity),
        frames: [],
        sampleRate: context.sampleRate,
        windowSamples: windowSize,
      }
      setDebugBundle(undefined)
      setDebugStatus('recording')
      setDebugRemainingMs(durationMs)
    },
    [start, status],
  )

  const downloadDebugCapture = useCallback(async () => {
    if (!debugBundle) return
    await shareOrDownloadBytes(debugBundle.filename, debugBundle.zip)
  }, [debugBundle])

  useEffect(() => {
    return () => {
      stopLoop()
      detachUnlock()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      void audioRef.current?.close()
    }
  }, [stopLoop, detachUnlock])

  return {
    status,
    errorCode,
    errorDetail,
    live,
    start,
    stop,
    diagnostics,
    debugStatus,
    debugRemainingMs,
    debugBundle,
    startDebugCapture,
    downloadDebugCapture,
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
