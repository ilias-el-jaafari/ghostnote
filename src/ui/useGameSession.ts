import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyScoreWindow,
  buildScorePlan,
  buildTimeline,
  createScoreState,
  finalizeScore,
  snapshotScore,
  type RoundResult,
  type ScoreSnapshot,
  type ScoreState,
  type SingerSample,
  type SongTimeline,
} from '../game/index.ts'
import { simulatedSampleAt } from '../game/index.ts'
import type { ParsedSong } from '../parser/index.ts'
import { DEFAULT_MIC_MIN_RMS } from '../audio/mix.ts'
import { frequencyToMidi } from '../pitch/index.ts'
import { type LivePitch } from '../pitch/usePitchDetection.ts'

export type SessionStatus = 'playing' | 'paused' | 'ended'

export type GameSession = {
  timeline: SongTimeline
  timeMs: number
  status: SessionStatus
  snapshot: ScoreSnapshot
  result: RoundResult | undefined
  start: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  setTime: (timeMs: number) => void
  finish: () => RoundResult
}

export type SessionOptions = {
  simulated?: boolean
  noiseCents?: number
  seekMs?: number
  /** When the backing track is playing, prefer its currentTime as the game clock. */
  getMediaTimeMs?: () => number | undefined
  /** RMS gate for mic presence (rap notes). Comes from the sensitivity slider. */
  minRms?: number
}

function micSample(live: LivePitch | undefined, minRms: number): SingerSample {
  const frequency = live?.frequency
  return {
    midi: frequency && frequency > 0 ? frequencyToMidi(frequency) : null,
    presence: (live?.rms ?? 0) >= minRms,
  }
}

function sampleAt(
  timeline: SongTimeline,
  timeMs: number,
  options: SessionOptions,
  live: LivePitch | undefined,
): SingerSample {
  if (options.simulated) {
    return simulatedSampleAt(timeline, timeMs, { noiseCents: options.noiseCents ?? 0 })
  }
  return micSample(live, options.minRms ?? DEFAULT_MIC_MIN_RMS)
}

function applyFrom(
  state: ScoreState,
  timeline: SongTimeline,
  fromMs: number,
  toMs: number,
  options: SessionOptions,
  live: LivePitch | undefined,
  stepMs = 10,
) {
  if (toMs <= fromMs) return
  for (let time = fromMs; time < toMs; time += stepMs) {
    const end = Math.min(time + stepMs, toMs)
    applyScoreWindow(state, time, end, sampleAt(timeline, time, options, live))
  }
}

function seedState(
  timeline: SongTimeline,
  plan: ReturnType<typeof buildScorePlan>,
  options: SessionOptions,
): { state: ScoreState; time: number } {
  const state = createScoreState(plan)
  const time = options.seekMs ?? -timeline.countInMs
  if (options.simulated && time > -timeline.countInMs) {
    applyFrom(state, timeline, -timeline.countInMs, time, options, undefined)
  }
  return { state, time }
}

declare global {
  interface Window {
    __GHOSTNOTE__?: {
      setTime: (timeMs: number) => void
      finish: () => void
      getTime: () => number
    }
  }
}

export function useGameSession(
  song: ParsedSong,
  options: SessionOptions,
  live: LivePitch | undefined,
): GameSession {
  const timeline = useMemo(() => buildTimeline(song), [song])
  const plan = useMemo(() => buildScorePlan(timeline), [timeline])

  const optionsRef = useRef(options)
  const liveRef = useRef(live)

  const seeded = useMemo(() => seedState(timeline, plan, options), [timeline, plan, options])
  const stateRef = useRef<ScoreState>(seeded.state)
  const appliedUntilRef = useRef(seeded.time)
  const originRef = useRef(0)
  const timeRef = useRef(seeded.time)

  const [timeMs, setTimeMs] = useState(seeded.time)
  const [status, setStatus] = useState<SessionStatus>('playing')
  const [snapshot, setSnapshot] = useState<ScoreSnapshot>(() =>
    snapshotScore(seeded.state, seeded.time),
  )
  const [result, setResult] = useState<RoundResult | undefined>(undefined)

  useEffect(() => {
    optionsRef.current = options
    liveRef.current = live
  }, [live, options])

  const bootstrap = useCallback(
    (targetTime: number, ended: boolean) => {
      const next = createScoreState(plan)
      const startAt = -timeline.countInMs
      if (targetTime > startAt && optionsRef.current.simulated) {
        applyFrom(next, timeline, startAt, targetTime, optionsRef.current, liveRef.current)
      }
      stateRef.current = next
      appliedUntilRef.current = targetTime
      timeRef.current = targetTime
      setTimeMs(targetTime)
      setSnapshot(snapshotScore(next, targetTime))
      if (ended) {
        const final = finalizeScore(next, timeline.endMs)
        setResult(final)
        setStatus('ended')
      } else {
        setResult(undefined)
        setStatus('playing')
        originRef.current = performance.now() - targetTime
      }
    },
    [plan, timeline],
  )

  const finish = useCallback((): RoundResult => {
    const final = finalizeScore(stateRef.current, timeline.endMs)
    timeRef.current = timeline.endMs
    setTimeMs(timeline.endMs)
    setSnapshot(final)
    setResult(final)
    setStatus('ended')
    return final
  }, [timeline.endMs])

  useEffect(() => {
    if (status !== 'playing') return
    originRef.current = performance.now() - timeRef.current
    let frame = 0
    const loop = () => {
      let next = performance.now() - originRef.current
      if (next >= 0) {
        const media = optionsRef.current.getMediaTimeMs?.()
        if (media !== undefined && media >= 0) {
          next = media
          originRef.current = performance.now() - next
        }
      }
      const previous = appliedUntilRef.current
      if (next > previous) {
        applyFrom(
          stateRef.current,
          timeline,
          previous,
          next,
          optionsRef.current,
          liveRef.current,
        )
        appliedUntilRef.current = next
      }
      timeRef.current = next
      setTimeMs(next)
      setSnapshot(snapshotScore(stateRef.current, next))
      if (next >= timeline.endMs) {
        finish()
        return
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [finish, status, timeline])

  const start = useCallback(() => bootstrap(-timeline.countInMs, false), [bootstrap, timeline.countInMs])
  const pause = useCallback(() => setStatus('paused'), [])
  const resume = useCallback(() => {
    if (status === 'ended') return
    setStatus('playing')
  }, [status])
  const restart = start
  const setTime = useCallback(
    (next: number) => {
      bootstrap(next, next >= timeline.endMs)
    },
    [bootstrap, timeline.endMs],
  )

  useEffect(() => {
    window.__GHOSTNOTE__ = {
      setTime,
      finish: () => {
        finish()
      },
      getTime: () => timeRef.current,
    }
    return () => {
      delete window.__GHOSTNOTE__
    }
  }, [finish, setTime])

  return {
    timeline,
    timeMs,
    status,
    snapshot,
    result,
    start,
    pause,
    resume,
    restart,
    setTime,
    finish,
  }
}
