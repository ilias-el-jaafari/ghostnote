import { useEffect, useRef } from 'react'
import { useGuideMelody } from '../audio/useGuideMelody.ts'
import {
  currentSyllableIndex,
  lineAt,
  MAX_SCORE,
  nextLine,
  simulatedSampleAt,
  type RoundResult,
} from '../game/index.ts'
import { useI18n } from '../i18n/index.ts'
import type { ParsedSong } from '../parser/index.ts'
import { usePitchDetection } from '../pitch/usePitchDetection.ts'
import { frequencyToMidi } from '../pitch/index.ts'
import { NoteHighway } from './NoteHighway.tsx'
import { useGameSession, type SessionOptions } from './useGameSession.ts'

type SingScreenProps = {
  song: ParsedSong
  options: SessionOptions
  guideMuted: boolean
  onToggleGuide: () => void
  onExit: () => void
  onFinished: (result: RoundResult) => void
}

export function SingScreen({
  song,
  options,
  guideMuted,
  onToggleGuide,
  onExit,
  onFinished,
}: SingScreenProps) {
  const { t } = useI18n()
  const mic = usePitchDetection()
  const needMic = !options.simulated
  const live = needMic && mic.status === 'listening' ? mic.live : undefined
  const session = useGameSession(song, options, live)
  const { timeline, timeMs, status, snapshot } = session

  useGuideMelody(timeline, timeMs, status === 'playing' && !guideMuted)

  const micRef = useRef(mic)
  useEffect(() => {
    micRef.current = mic
  }, [mic])

  useEffect(() => {
    if (!needMic) return
    if (mic.status === 'idle') void mic.start()
  }, [needMic, mic.status, mic.start])

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

  return (
    <div className="sing">
      <header className="sing-bar">
        <div className="sing-bar-left">
          <button type="button" className="btn btn-ghost btn-compact" onClick={onExit}>
            {t('sing.exit')}
          </button>
          {options.simulated ? <span className="sim-badge">{t('sing.simulated')}</span> : null}
        </div>
        <div className="sing-score" aria-live="polite">
          <span className="sing-score-label">{t('sing.score')}</span>
          <span className="sing-score-value">{score.toLocaleString()}</span>
          <span className="sing-score-max">{t('sing.ofMax', { max: MAX_SCORE })}</span>
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
        <p className="sing-track">
          {song.headers.artist} — {song.headers.title}
        </p>
        {inCountIn ? (
          <p className="count-in">
            {t('sing.getReady')} · {countdown}
          </p>
        ) : null}
        <NoteHighway timeline={timeline} timeMs={timeMs} sungMidi={sungMidi} />

        <div className="sing-lyrics">
          <p className="current-line">
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
          <p className="next-line">
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
