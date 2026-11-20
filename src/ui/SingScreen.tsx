import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { guideGainFor, rmsGateForSensitivity } from '../audio/mix.ts'
import { useGuideMelody } from '../audio/useGuideMelody.ts'
import { useSongPlayback } from '../audio/useSongPlayback.ts'
import {
  activeNotes,
  currentSyllableIndex,
  HIT_TOLERANCE_CENTS,
  lineAt,
  nextLine,
  simulatedSampleAt,
  type RoundResult,
} from '../game/index.ts'
import { useI18n } from '../i18n/index.ts'
import type { ParsedSong } from '../parser/index.ts'
import { comparePitchOctaveTolerant, frequencyToMidi, ultraStarPitchToMidi } from '../pitch/index.ts'
import { usePitchDetection } from '../pitch/usePitchDetection.ts'
import type { QualitySettings } from '../visual/quality.ts'
import {
  formatCabinetScore,
  formatClock,
  progressRatio,
  type ThemeId,
} from '../visual/themes.ts'
import { MixSlider } from './MixSlider.tsx'
import { NoteHighway } from './NoteHighway.tsx'
import { useGameSession, type SessionOptions } from './useGameSession.ts'
import { Waveform } from './Waveform.tsx'
import { YouTubeMiniPlayer } from './YouTubeMiniPlayer.tsx'
import {
  clampOffsetMs,
  persistSongOffset,
  readSongOffset,
  songOffsetKey,
} from '../youtube/offsets.ts'
import { useYouTubePlayer } from '../youtube/useYouTubePlayer.ts'

type SingScreenProps = {
  song: ParsedSong
  audioUrl: string | undefined
  audioMissing: boolean
  options: SessionOptions
  guideMuted: boolean
  guideVolume: number
  micSensitivity: number
  visual: QualitySettings
  themeId: ThemeId
  onToggleGuide: () => void
  onGuideVolume: (value: number) => void
  onMicSensitivity: (value: number) => void
  onExit: () => void
  onFinished: (result: RoundResult) => void
  youtubeId: string | undefined
  youtubeFromHeader?: boolean
  youtubeMock?: boolean
}

export function SingScreen({
  song,
  audioUrl,
  audioMissing,
  options,
  guideMuted,
  guideVolume,
  micSensitivity,
  visual,
  themeId,
  onToggleGuide,
  onGuideVolume,
  onMicSensitivity,
  onExit,
  onFinished,
  youtubeId,
  youtubeFromHeader = false,
  youtubeMock = false,
}: SingScreenProps) {
  const { t } = useI18n()
  const minRms = rmsGateForSensitivity(micSensitivity)
  const mic = usePitchDetection(micSensitivity)
  const needMic = !options.simulated
  const live = needMic && mic.status === 'listening' ? mic.live : undefined
  const useYoutube = Boolean(youtubeId) || youtubeMock
  const offsetKey = useMemo(
    () =>
      songOffsetKey({
        videoId: youtubeId ?? 'mock',
        title: song.headers.title,
        artist: song.headers.artist,
      }),
    [song.headers.artist, song.headers.title, youtubeId],
  )
  const [offsetMs, setOffsetMs] = useState(() =>
    readSongOffset(
      offsetKey,
      typeof window === 'undefined' ? undefined : window.localStorage,
      0,
    ),
  )
  const youtube = useYouTubePlayer({
    videoId: youtubeId,
    mock: youtubeMock,
    offsetMs,
    enabled: useYoutube,
    startMs: options.seekMs,
  })
  const playback = useSongPlayback(useYoutube ? undefined : audioUrl)
  const getMediaClock = useCallback(() => (useYoutube ? youtube.readClock() : undefined), [useYoutube, youtube])
  const sessionOptions: SessionOptions = {
    ...options,
    getMediaTimeMs: useYoutube ? undefined : playback.currentTimeMs,
    getMediaClock: useYoutube ? getMediaClock : undefined,
    minRms,
  }
  const session = useGameSession(song, sessionOptions, live)
  const { timeline, timeMs, status, snapshot } = session

  useGuideMelody(
    timeline,
    timeMs,
    status === 'playing' && !guideMuted,
    guideGainFor(guideVolume, Boolean(audioUrl) || useYoutube, guideMuted),
  )

  useEffect(() => {
    playback.sync(timeMs, status === 'playing')
  }, [playback, status, timeMs])

  const countingIn = timeMs < 0
  useEffect(() => {
    if (!useYoutube) return
    if (countingIn) {
      youtube.pause()
      return
    }
    if (status === 'playing') void youtube.play()
    else youtube.pause()
  }, [countingIn, status, useYoutube, youtube])

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

  function changeOffset(next: number) {
    const clamped = clampOffsetMs(next)
    setOffsetMs(clamped)
    persistSongOffset(
      offsetKey,
      clamped,
      typeof window === 'undefined' ? undefined : window.localStorage,
    )
  }

  const hitting = activeNotes(timeline, timeMs).some((note) => {
    if (note.type === 'freestyle') return false
    if (options.simulated) return true
    if (note.type === 'rap' || note.type === 'goldenRap') {
      return (live?.rms ?? 0) >= minRms
    }
    if (sungMidi === null) return false
    return comparePitchOctaveTolerant(
      sungMidi,
      ultraStarPitchToMidi(note.pitch),
      HIT_TOLERANCE_CENTS,
    ).match
  })

  const timeStart = -timeline.countInMs
  const ratio = progressRatio(timeMs, timeStart, timeline.endMs)
  const accuracyPct = Math.round(snapshot.accuracy * 100)

  return (
    <div className={useYoutube ? 'sing sing-with-yt' : 'sing'}>
      {visual.waveform ? (
        <div className="spectrum" aria-hidden="true">
          <Waveform analyser={playback.analyser} active={status === 'playing'} />
        </div>
      ) : null}

      <header className="sing-bar hud-panel">
        <div className="sing-bar-left">
          <button type="button" className="btn btn-ghost btn-compact" onClick={onExit}>
            {t('sing.exit')}
          </button>
          {options.simulated ? <span className="sim-badge">{t('sing.simulated')}</span> : null}
        </div>
        <div className="score-capsules" aria-live="polite">
          <ScoreCapsule
            tone="notes"
            label={t('sing.noteScore')}
            value={formatCabinetScore(snapshot.noteScore)}
          />
          <ScoreCapsule
            tone="bonus"
            label={t('sing.lineBonus')}
            value={formatCabinetScore(snapshot.lineBonus)}
          />
          <ScoreCapsule
            tone="total"
            label={t('sing.score')}
            value={formatCabinetScore(score)}
          />
          <ScoreCapsule
            tone="accuracy"
            label={t('results.accuracy')}
            value={`${formatCabinetScore(accuracyPct, 3)}%`}
          />
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

      <div className="sing-mix">
        <MixSlider
          label={t('sing.guideVolume')}
          value={guideVolume}
          onChange={onGuideVolume}
        />
        {needMic ? (
          <MixSlider
            label={t('mic.sensitivity')}
            value={micSensitivity}
            onChange={onMicSensitivity}
          />
        ) : null}
      </div>

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
        <div className="highway-wrap">
          <div className="player-token" aria-label={t('sing.player', { n: 1 })}>
            <span>1</span>
          </div>
          <NoteHighway
            timeline={timeline}
            timeMs={timeMs}
            sungMidi={sungMidi}
            hitting={hitting}
            particles={visual.particles}
            flares={visual.flares}
            maxParticles={visual.maxParticles}
            themeId={themeId}
          />
        </div>

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

        <div
          className="time-bar"
          role="progressbar"
          aria-label={t('sing.time')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <span className="time-bar-label outlined">{t('sing.time')}</span>
          <div className="time-bar-track">
            <div className="time-bar-fill" style={{ width: `${ratio * 100}%` }} />
          </div>
          <span className="time-bar-clock outlined">
            {formatClock(Math.max(0, timeMs))} / {formatClock(timeline.endMs)}
          </span>
        </div>
      </section>
      {useYoutube ? (
        <YouTubeMiniPlayer
          player={youtube}
          hostRef={youtube.hostRef}
          title={`${song.headers.artist} — ${song.headers.title}`}
          fromHeader={youtubeFromHeader}
          offsetMs={offsetMs}
          onOffsetChange={changeOffset}
          onSeekSong={(ms) => session.setTime(Math.max(0, ms))}
          onUserPlay={session.resume}
          onUserPause={session.pause}
        />
      ) : null}
    </div>
  )
}

function ScoreCapsule({
  tone,
  label,
  value,
}: {
  tone: 'notes' | 'bonus' | 'total' | 'accuracy'
  label: string
  value: string
}) {
  return (
    <div className={`score-capsule score-${tone}`}>
      <span className="score-capsule-label outlined">{label}</span>
      <span className="score-capsule-value outlined">{value}</span>
    </div>
  )
}
