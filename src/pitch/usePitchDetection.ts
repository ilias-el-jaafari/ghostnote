import { useCallback, useEffect, useRef, useState } from 'react'
import {
  boostInPlace,
  DEFAULT_MIC_MIN_RMS,
  DEFAULT_MIC_SENSITIVITY,
  rmsGateForSensitivity,
  yinFallbackForSensitivity,
  yinThresholdForSensitivity,
} from '../audio/mix.ts'
import { OctaveHysteresis } from './smooth.ts'
import { frequencyToNoteName, type NamedNote } from './note.ts'
import {
  DEFAULT_MAX_PITCH_HZ,
  DEFAULT_MIN_PITCH_HZ,
  detectPitchYin,
  RECOMMENDED_PITCH_WINDOW,
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

/** Default gate at the default sensitivity. Prefer `rmsGateForSensitivity`. */
export const MIC_MIN_RMS = DEFAULT_MIC_MIN_RMS

const FFT_SIZE = RECOMMENDED_PITCH_WINDOW

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || window.webkitAudioContext
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

  const audioRef = useRef<AudioContext | undefined>(undefined)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const analyserRef = useRef<AnalyserNode | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const bufferRef = useRef<Float32Array<ArrayBuffer> | undefined>(undefined)
  const smootherRef = useRef(new OctaveHysteresis())

  useEffect(() => {
    sensitivityRef.current = sensitivity
  }, [sensitivity])

  const stopLoop = useCallback(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }
  }, [])

  const stop = useCallback(async () => {
    stopLoop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
    analyserRef.current?.disconnect()
    analyserRef.current = undefined
    bufferRef.current = undefined
    if (audioRef.current) {
      await audioRef.current.close().catch(() => undefined)
      audioRef.current = undefined
    }
    smootherRef.current.reset()
    setLive({ frequency: null, note: null, probability: 0, rms: 0 })
    setStatus('idle')
  }, [stopLoop])

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      })
      streamRef.current = stream

      const context = new AudioContextCtor()
      audioRef.current = context
      if (context.state === 'suspended') {
        await context.resume()
      }

      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)
      analyserRef.current = analyser
      bufferRef.current = new Float32Array(analyser.fftSize)

      const loop = () => {
        const activeAnalyser = analyserRef.current
        const activeContext = audioRef.current
        const buffer = bufferRef.current
        if (!activeAnalyser || !activeContext || !buffer) return

        activeAnalyser.getFloatTimeDomainData(buffer)
        const sensitivityNow = sensitivityRef.current
        const minRms = rmsGateForSensitivity(sensitivityNow)
        const rawRms = boostInPlace(buffer)
        const result =
          rawRms >= minRms
            ? detectPitchYin(buffer, {
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
  }, [stop])

  useEffect(() => {
    return () => {
      stopLoop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      void audioRef.current?.close()
    }
  }, [stopLoop])

  return { status, errorCode, errorDetail, live, start, stop }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
