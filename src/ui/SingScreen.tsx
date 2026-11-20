import { useEffect, useRef } from 'react'
import { useGuideMelody } from '../audio/useGuideMelody.ts'
import { useSongPlayback } from '../audio/useSongPlayback.ts'
import {
  activeNotes,
  currentSyllableIndex,
  HIT_TOLERANCE_CENTS,
  lineAt,
  MAX_SCORE,
  nextLine,
  simulatedSampleAt,
  type RoundResult,
} from '../game/index.ts'
import { useI18n } from '../i18n/index.ts'
import type { ParsedSong } from '../parser/index.ts'
import { comparePitchOctaveTolerant, frequencyToMidi, ultraStarPitchToMidi } from '../pitch/index.ts'
import { MIC_MIN_RMS, usePitchDetection } from '../pitch/usePitchDetection.ts'
import type { QualitySettings } from '../visual/quality.ts'
import { NoteHighway } from './NoteHighway.tsx'
import { useGameSession, type SessionOptions } from './useGameSession.ts'
import { Waveform } from './Waveform.tsx'

type SingScreenProps = {
  song: ParsedSong
  audioUrl: string | undefined
  audioMissing: boolean
  options: SessionOptions
  guideMuted: boolean
  visual: QualitySettings
  onToggleGuide: () => void
  onExit: () => void
  onFinished: (result: RoundResult) => void
}

export function SingScreen({
  song,
  audioUrl,
  audioMissing,
  options,
  guideMuted,
  visual,
  onToggleGuide,
  onExit,
  onFinished,
}: SingScreenProps) {
  const { t } = useI18n()
  const mic = usePitchDetection()
  const needMic = !options.simulated
  const live = needMic && mic.status === 'listening' ? mic.live : undefined
  const playback = useSongPlayback(audioUrl)
  const sessionOptions: SessionOptions = {
    ...options,
    getMediaTimeMs: playback.currentTimeMs,
  }
  const session = useGameSession(song, sessionOptions, live)
  const { timeline, timeMs, status, snapshot } = session

  useGuideMelody(
    timeline,
    timeMs,
    status === 'playing' && !guideMuted,
    audioUrl ? 0.035 : 0.07,
  )

  useEffect(() => {
    playback.sync(timeMs, status === 'playing')
  }, [playback, status, timeMs])

  const micRef = useRef(mic)
  useEffect(() => {
    micRef.current = mic
  }, [mic])

  useEffect(() => {
    if (!needMic) return
    const current = micRef.current
    if (current.status === 'idle') void current.start()
  }, [needMic, mic.status])

  useEffect(() => {
    if (status === 'ended' && session.result) onFinished(session.result)
  }, [onFinished, session.result, status])

  useEffect(() => {
    return () => {
      void micRef.current.stop()
    }
  }, [])

  const sungMidi = options.simulated
    ? simulatedSampleAt(timeline, timeMs).midi
    : live?.frequency
      ? frequencyToMidi(live.frequency)
      : null

  const current = lineAt(timeline, timeMs)
  const upcoming = nextLine(timeline, timeMs)
  const syllable = currentSyllableIndex(timeline, timeMs)
  const inCountIn = timeMs < 0
  const countdown = inCountIn ? Math.max(1, Math.ceil(-timeMs / 1000)) : 0
  const score = Math.round(snapshot.total)

  const hitting = activeNotes(timeline, timeMs).some((note) => {
    if (note.type === 'freestyle') return false
    if (options.simulated) return true
    if (note.type === 'rap' || note.type === 'goldenRap') {
      return (live?.rms ?? 0) >= MIC_MIN_RMS
    }
    if (sungMidi === null) return false
    return comparePitchOctaveTolerant(
      sungMidi,
      ultraStarPitchToMidi(note.pitch),
      HIT_TOLERANCE_CENTS,
    ).match
  })

  return (
    <div className="sing">
      <header className="sing-bar hud-panel">
        <div className="sing-bar-left">
          <button type="button" className="btn btn-ghost btn-compact" onClick={onExit}>
            {t('sing.exit')}
          </button>
          {options.simulated ? <span className="sim-badge">{t('sing.simulated')}</span> : null}
        </div>
        <div className="sing-score" aria-live="polite">
          <span className="sing-score-label outlined">{t('sing.score')}</span>
          <span className="sing-score-value outlined">{score.toLocaleString()}</span>
          <span className="sing-score-max outlined">{t('sing.ofMax', { max: MAX_SCORE })}</span>
        </div>
        <div className="sing-bar-right">
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={onToggleGuide}
          >
            {guideMuted ? t('sing.unmuteGuide') : t('sing.muteGuide')}
          </button>
          {status === 'paused' ? (
            <button type="button" className="btn btn-primary btn-compact" onClick={session.resume}>
              {t('sing.resume')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={session.pause}
              disabled={status !== 'playing'}
            >
              {t('sing.pause')}
            </button>
          )}
        </div>
      </header>

      <section className="sing-stage">
        <p className="sing-track outlined">
          {song.headers.artist} — {song.headers.title}
        </p>
        {audioMissing ? (
          <p className="banner banner-warn" role="status">
            {t('sing.audioMissing')}
          </p>
        ) : null}
        {inCountIn ? (
          <p className="count-in outlined">
            {t('sing.getReady')} · {countdown}
          </p>
        ) : null}
        {visual.waveform ? (
          <div className="waveform hud-panel">
            <Waveform analyser={playback.analyser} active={status === 'playing'} />
          </div>
        ) : null}
        <NoteHighway
          timeline={timeline}
          timeMs={timeMs}
          sungMidi={sungMidi}
          hitting={hitting}
          particles={visual.particles}
          flares={visual.flares}
          maxParticles={visual.maxParticles}
        />

        <div className="sing-lyrics hud-panel">
          <p className="current-line outlined">
            {current
              ? current.notes.map((note, index) => (
                  <span
                    key={`${note.startBeat}-${index}`}
                    className={
                      syllable?.lineIndex === current.index &&
                      syllable.noteIndexInLine === index
                        ? `syllable syllable-${note.type} is-current`
                        : `syllable syllable-${note.type}`
                    }
                  >
                    {note.text}
                  </span>
                ))
              : ' '}
          </p>
          <p className="next-line outlined">
            {upcoming ? (
              <>
                <span className="next-label">{t('sing.next')}</span>
                {upcoming.text}
              </>
            ) : (
              ' '
            )}
          </p>
        </div>
      </section>
    </div>
  )
}
