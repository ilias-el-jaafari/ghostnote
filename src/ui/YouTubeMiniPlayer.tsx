import { useEffect, useId, useState, type Ref } from 'react'
import { useI18n } from '../i18n/index.ts'
import { formatClock } from '../visual/themes.ts'
import { YT_PLAYING } from '../youtube/clock.ts'
import type { YouTubePlayerController } from '../youtube/useYouTubePlayer.ts'
import { YOUTUBE_MIN_SIZE } from '../youtube/useYouTubePlayer.ts'

export type YouTubeMiniPlayerProps = {
  player: YouTubePlayerController
  hostRef: Ref<HTMLDivElement | null>
  title: string
  fromHeader?: boolean
  compact?: boolean
  offsetMs: number
  onOffsetChange: (offsetMs: number) => void
  onSeekSong?: (timeMs: number) => void
  onUserPlay?: () => void
  onUserPause?: () => void
}

export function YouTubeMiniPlayer({
  player,
  hostRef,
  title,
  fromHeader = false,
  compact = false,
  offsetMs,
  onOffsetChange,
  onSeekSong,
  onUserPlay,
  onUserPause,
}: YouTubeMiniPlayerProps) {
  const { t } = useI18n()
  const seekId = useId()
  const offsetId = useId()
  const [displayMs, setDisplayMs] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let frame = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last >= 80) {
        last = now
        const clock = player.readClock()
        if (clock) {
          setDisplayMs(Math.max(0, clock.timeMs - offsetMs))
          setRunning(clock.running)
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [offsetMs, player])

  async function onPlayPause() {
    const wasRunning = player.isRunning()
    await player.toggle()
    if (wasRunning) onUserPause?.()
    else onUserPlay?.()
  }

  function onSeek(value: number) {
    player.seekToMs(value + offsetMs)
    onSeekSong?.(value + offsetMs)
  }

  const displayTitle = player.title || title
  const duration = player.durationMs
  const displayTime = Math.min(displayMs, duration || displayMs)

  return (
    <aside
      className={compact ? 'yt-mini is-compact hud-panel' : 'yt-mini hud-panel'}
      aria-label={t('youtube.player')}
    >
      <header className="yt-mini-chrome">
        <span className="yt-mini-badge outlined">YT</span>
        <p className="yt-mini-title outlined" title={displayTitle}>
          {displayTitle}
        </p>
      </header>

      <div className="yt-mini-body">
        <div
          className={player.mock ? 'yt-mini-screen is-mock' : 'yt-mini-screen'}
          style={{
            width: YOUTUBE_MIN_SIZE,
            height: YOUTUBE_MIN_SIZE,
            minWidth: YOUTUBE_MIN_SIZE,
            minHeight: YOUTUBE_MIN_SIZE,
          }}
        >
          {player.mock ? (
            <div className="yt-mock-face" aria-hidden="true">
              <span className="yt-mock-label">PREVIEW</span>
              <FakeSpectrum playing={running} />
            </div>
          ) : (
            <div className="yt-mini-host" ref={hostRef} />
          )}
        </div>

        <div className="yt-mini-side">
          {compact || player.mock ? null : <FakeSpectrum playing={running} />}

          <div className="yt-transport">
            <button
              type="button"
              className="btn btn-primary btn-compact yt-play"
              onClick={() => void onPlayPause()}
            >
              {running || player.state === YT_PLAYING ? t('sing.pause') : t('youtube.play')}
            </button>
            <span className="yt-time outlined">
              {formatClock(displayTime)} / {formatClock(duration)}
            </span>
          </div>

          <label className="yt-seek" htmlFor={seekId}>
            <span className="visually-hidden">{t('youtube.seek')}</span>
            <input
              id={seekId}
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              step={50}
              value={Math.max(0, Math.round(displayTime))}
              onChange={(event) => onSeek(Number(event.target.value))}
            />
          </label>

          <div className="yt-offset" aria-label={t('instrumental.nudge')}>
            <span className="yt-offset-label outlined">{t('youtube.offset')}</span>
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => onOffsetChange(offsetMs - 50)}>
              −50
            </button>
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => onOffsetChange(offsetMs - 10)}>
              −10
            </button>
            <input
              id={offsetId}
              type="range"
              min={-2000}
              max={2000}
              step={10}
              value={offsetMs}
              aria-label={t('youtube.offset')}
              onChange={(event) => onOffsetChange(Number(event.target.value))}
            />
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => onOffsetChange(offsetMs + 10)}>
              +10
            </button>
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => onOffsetChange(offsetMs + 50)}>
              +50
            </button>
            <span className="yt-offset-value outlined">{offsetMs} ms</span>
          </div>
          <p className="yt-mini-hint">{t('instrumental.nudgeHint')}</p>

          {fromHeader ? <p className="yt-mini-hint">{t('youtube.fromHeader')}</p> : null}
          {player.needsTap ? (
            <p className="yt-mini-hint yt-mini-hint-warn">{t('youtube.tapToStart')}</p>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

export function FakeSpectrum({ playing }: { playing: boolean }) {
  return (
    <div className={playing ? 'yt-spectrum is-playing' : 'yt-spectrum'} aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => (
        <span key={index} style={{ animationDelay: `${index * 0.07}s` }} />
      ))}
    </div>
  )
}
