import { useCallback, useEffect, useRef, useState } from 'react'
import { frequencyToNoteName, type NamedNote } from './note.ts'
import { detectPitchYin } from './yin.ts'

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

const FFT_SIZE = 8192
const MIN_RMS = 0.008

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext || window.webkitAudioContext
}

function computeRms(samples: Float32Array): number {
  let sumSq = 0
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0
    sumSq += sample * sample
  }
  return Math.sqrt(sumSq / samples.length)
}

export function usePitchDetection() {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
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
      setErrorMessage('This browser cannot access a microphone.')
      return
    }

    setErrorMessage(undefined)
    setStatus('requesting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
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
        const rms = computeRms(buffer)
        const result =
          rms >= MIN_RMS
            ? detectPitchYin(buffer, {
                sampleRate: activeContext.sampleRate,
                minFrequency: 80,
                maxFrequency: 1000,
                minRms: MIN_RMS,
              })
            : null

        if (result) {
          setLive({
            frequency: result.frequency,
            note: frequencyToNoteName(result.frequency),
            probability: result.probability,
            rms,
          })
        } else {
          setLive({
            frequency: null,
            note: null,
            probability: 0,
            rms,
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
        setErrorMessage(
          'Microphone permission was denied. Enable it in the browser settings and try again.',
        )
        return
      }
      if (name === 'NotFoundError') {
        setStatus('error')
        setErrorMessage('No microphone was found on this device.')
        return
      }
      setStatus('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not start the microphone.',
      )
    }
  }, [stop])

  useEffect(() => {
    return () => {
      stopLoop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      void audioRef.current?.close()
    }
  }, [stopLoop])

  return { status, errorMessage, live, start, stop }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
