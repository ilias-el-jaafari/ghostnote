import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { buildTimeline } from '../game/index.ts'
import { useI18n } from '../i18n/index.ts'
import type { ParsedSong } from '../parser/index.ts'
import { formatClock } from '../visual/themes.ts'
import { compareDurations, formatDurationDiff, formatDurationMs } from '../youtube/duration.ts'
import {
  instrumentalSearchUrl,
  parseYouTubeIds,
  persistSourcePreference,
  songIdentityKey,
  type AudioSourceKind,
} from '../youtube/instrumentals.ts'
import { NUDGE_LARGE_MS, NUDGE_SMALL_MS, averageTapOffset, countdownToFirstNote, offsetFromTap } from '../youtube/tapSync.ts'
import {
  persistYoutubeApiKey,
  readYoutubeApiKey,
} from '../youtube/search.ts'
import { clampOffsetMs, persistSongOffset, readSongOffset, songOffsetKey } from '../youtube/offsets.ts'
import { useInstrumentalMatching } from '../youtube/useInstrumentalMatching.ts'
import { useYouTubePlayer } from '../youtube/useYouTubePlayer.ts'
import { YouTubeMiniPlayer } from './YouTubeMiniPlayer.tsx'

export type InstrumentalSetupProps = {
  song: ParsedSong
  localAudioUrl: string | undefined
  originalYoutubeId: string | undefined
  hasLocalAudio: boolean
  source: AudioSourceKind
  instrumentalId: string | undefined
  fallbackToOriginal?: boolean
  mock?: boolean
  onSourceChange: (source: AudioSourceKind) => void
  onInstrumentalId: (videoId: string | undefined) => void
}

export function InstrumentalSetup({
  song,
  localAudioUrl,
  originalYoutubeId,
  hasLocalAudio: _hasLocalAudio,
  source,
  instrumentalId,
  fallbackToOriginal = false,
  mock = false,
  onSourceChange,
  onInstrumentalId,
}: InstrumentalSetupProps) {
  const { t } = useI18n()
  const artist = song.headers.artist
  const title = song.headers.title
  const timeline = useMemo(() => buildTimeline(song), [song])
  const matching = useInstrumentalMatching({
    artist,
    title,
    originalYoutubeId,
    localAudioUrl,
    lastNoteMs: timeline.lastNoteMs,
    savedInstrumentalId: instrumentalId,
    mock,
    enabled: true,
    onAutoSelect: onInstrumentalId,
  })

  const [paste, setPaste] = useState('')
  const [pasteError, setPasteError] = useState<string | undefined>(undefined)
  const [apiKey, setApiKey] = useState(() =>
    typeof window === 'undefined' ? '' : (readYoutubeApiKey(window.localStorage) ?? ''),
  )

  function setSource(next: AudioSourceKind) {
    persistSourcePreference(songIdentityKey(artist, title), next, window.localStorage)
    onSourceChange(next)
  }

  function submitPaste(event: FormEvent) {
    event.preventDefault()
    const ids = parseYouTubeIds(paste)
    if (ids.length === 0) {
      setPasteError(t('youtube.invalidUrl'))
      return
    }
    setPasteError(undefined)
    setPaste('')
    void matching.applyPasted(ids).then(() => {
      const chosen = ids.length === 1 ? ids[0] : undefined
      if (chosen) onInstrumentalId(chosen)
    })
    if (!instrumentalId && ids.length === 1 && ids[0]) onInstrumentalId(ids[0])
    setSource('instrumental')
  }

  return (
    <div className="instrumental-setup">
      <fieldset className="source-picker">
        <legend className="outlined">{t('source.title')}</legend>
        <label className={source === 'original' ? 'source-option is-selected' : 'source-option'}>
          <input
            type="radio"
            name="audio-source"
            checked={source === 'original'}
            onChange={() => setSource('original')}
          />
          <span>
            {t('source.original')}
            <small>{t('source.originalHint')}</small>
          </span>
        </label>
        <label className={source === 'instrumental' ? 'source-option is-selected' : 'source-option'}>
          <input
            type="radio"
            name="audio-source"
            checked={source === 'instrumental'}
            onChange={() => setSource('instrumental')}
          />
          <span>
            {t('source.instrumental')}
            <small>{t('source.instrumentalHint')}</small>
          </span>
        </label>
      </fieldset>

      <div className="instrumental-actions">
        <a
          className="btn btn-ghost btn-compact"
          href={instrumentalSearchUrl(artist, title)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('instrumental.find')}
        </a>
      </div>

      <form className="yt-url-field" onSubmit={submitPaste}>
        <label className="yt-url-label outlined" htmlFor="yt-instrumental-url">
          {t('instrumental.paste')}
        </label>
        <div className="yt-url-row">
          <input
            id="yt-instrumental-url"
            type="text"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value)
              setPasteError(undefined)
            }}
          />
          <button type="submit" className="btn btn-primary btn-compact">
            {t('youtube.apply')}
          </button>
        </div>
        {pasteError ? (
          <p className="banner banner-error" role="alert">
            {pasteError}
          </p>
        ) : (
          <p className="yt-url-hint">{t('instrumental.pasteHint')}</p>
        )}
      </form>

      {matching.status === 'searching' ? (
        <p className="yt-url-hint" role="status">
          {t('instrumental.searching')}
        </p>
      ) : null}
      {matching.attempts.length > 0 ? (
        <ul className="search-attempts">
          {matching.attempts.map((attempt, index) => (
            <li key={`${attempt.provider}-${attempt.instance ?? index}`} className={`search-attempt is-${attempt.status}`}>
              {t(
                attempt.status === 'found'
                  ? 'instrumental.providerFound'
                  : attempt.status === 'searching'
                    ? 'instrumental.providerSearching'
                    : 'instrumental.providerFailed',
                {
                  provider: attempt.instance
                    ? `${attempt.provider} (${attempt.instance.replace(/^https:\/\//, '')})`
                    : attempt.provider,
                },
              )}
              {attempt.detail && attempt.status === 'failed' ? ` — ${attempt.detail}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {matching.status === 'failed' ? (
        <p className="banner banner-warn" role="status">
          {t('instrumental.searchFailed')}{' '}
          <button type="button" className="btn btn-ghost btn-compact" onClick={matching.retry}>
            {t('instrumental.retry')}
          </button>
        </p>
      ) : null}
      {fallbackToOriginal && matching.status !== 'searching' ? (
        <p className="banner banner-warn" role="status">
          {t('instrumental.noInstrumentalFallback')}
        </p>
      ) : null}

      {source === 'instrumental' ? (
        <DurationAndCandidates
          matching={matching}
          onChoose={(id) => {
            matching.choose(id)
            onInstrumentalId(id)
            setSource('instrumental')
          }}
        />
      ) : null}

      {source === 'instrumental' && (instrumentalId || mock) ? (
        <TapSyncPanel
          key={instrumentalId ?? matching.selected?.id ?? 'none'}
          artist={artist}
          title={title}
          videoId={instrumentalId ?? matching.selected?.id}
          firstNoteMs={timeline.firstNoteMs}
          mock={mock}
          comparisonSameLength={matching.comparison?.sameLength ?? false}
          suggestedOffsetMs={matching.comparison?.suggestedOffsetMs ?? 0}
        />
      ) : null}

      <details className="instrumental-advanced">
        <summary>{t('instrumental.apiKey')}</summary>
        <p className="yt-url-hint">{t('instrumental.apiKeyHint')}</p>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          aria-label={t('instrumental.apiKey')}
          onChange={(event) => {
            const value = event.target.value
            setApiKey(value)
            persistYoutubeApiKey(value, window.localStorage)
          }}
        />
      </details>
    </div>
  )
}

function DurationAndCandidates({
  matching,
  onChoose,
}: {
  matching: ReturnType<typeof useInstrumentalMatching>
  onChoose: (id: string) => void
}) {
  const { t } = useI18n()
  const comparison = matching.comparison
  const selected = matching.selected
  return (
    <div className="instrumental-results">
      {comparison && selected ? (
        <p
          className={comparison.sameLength ? 'length-badge is-match' : 'length-badge is-diff'}
          role="status"
        >
          {comparison.sameLength
            ? t('instrumental.sameLength', { duration: formatDurationMs(comparison.candidateMs) })
            : t('instrumental.lengthDiffers', { diff: formatDurationDiff(comparison.absDiffMs) })}
          {comparison.sameLength && matching.selected ? (
            <span className="length-badge-title"> {t('instrumental.autoPicked', { title: selected.title })}</span>
          ) : null}
        </p>
      ) : null}

      {matching.candidates.length > 0 ? (
        <ul className="instrumental-candidates">
          <li className="instrumental-candidates-label outlined">{t('instrumental.candidates')}</li>
          {matching.candidates.slice(0, 6).map((item) => {
            const itemCmp =
              matching.referenceMs && item.durationMs > 0
                ? compareDurations(matching.referenceMs, item.durationMs)
                : undefined
            return (
              <li key={item.id}>
                <label className={item.id === selected?.id ? 'candidate is-selected' : 'candidate'}>
                  <input
                    type="radio"
                    name="instrumental-candidate"
                    checked={item.id === selected?.id}
                    onChange={() => onChoose(item.id)}
                  />
                  <span className="candidate-title">{item.title}</span>
                  <span className="candidate-meta">
                    {item.durationMs > 0 ? formatDurationMs(item.durationMs) : '—'}
                    {itemCmp
                      ? itemCmp.sameLength
                        ? ` · ${t('instrumental.matchMark')}`
                        : ` · ${itemCmp.diffMs >= 0 ? '+' : '−'}${formatDurationDiff(itemCmp.absDiffMs)}`
                      : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : matching.status === 'ready' ? (
        <p className="yt-url-hint">{t('instrumental.noCandidates')}</p>
      ) : null}
    </div>
  )
}

function TapSyncPanel({
  artist,
  title,
  videoId,
  firstNoteMs,
  mock,
  comparisonSameLength,
  suggestedOffsetMs,
}: {
  artist: string
  title: string
  videoId: string | undefined
  firstNoteMs: number
  mock: boolean
  comparisonSameLength: boolean
  suggestedOffsetMs: number
}) {
  const { t } = useI18n()
  const offsetKey = useMemo(
    () => songOffsetKey({ videoId: videoId ?? 'mock', artist, title }),
    [artist, title, videoId],
  )
  const [offsetMs, setOffsetMs] = useState(() =>
    readSongOffset(
      offsetKey,
      typeof window === 'undefined' ? undefined : window.localStorage,
      comparisonSameLength ? suggestedOffsetMs : 0,
    ),
  )
  const [taps, setTaps] = useState<number[]>([])
  const [remainingMs, setRemainingMs] = useState<number | undefined>(undefined)
  const [armed, setArmed] = useState(false)


  const player = useYouTubePlayer({
    videoId,
    mock,
    offsetMs: 0,
    enabled: Boolean(videoId) || mock,
  })

  useEffect(() => {
    if (!armed) return
    let frame = 0
    const loop = () => {
      const clock = player.readClock()
      const mediaMs = clock ? Math.max(0, clock.timeMs) : 0
      setRemainingMs(countdownToFirstNote(firstNoteMs, mediaMs))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [armed, firstNoteMs, player])

  function saveOffset(next: number) {
    const clamped = clampOffsetMs(next)
    setOffsetMs(clamped)
    persistSongOffset(offsetKey, clamped, window.localStorage)
  }

  function recordTap() {
    const clock = player.readClock()
    const mediaMs = clock ? Math.max(0, clock.timeMs) : 0
    const nextTaps = [...taps, mediaMs]
    setTaps(nextTaps)
    saveOffset(averageTapOffset(nextTaps, firstNoteMs))
  }

  useEffect(() => {
    if (!armed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      event.preventDefault()
      recordTap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function startSync() {
    setArmed(true)
    setTaps([])
    player.seekToMs(0)
    await player.play()
  }

  const lastTap = taps[taps.length - 1]
  const countdownLabel =
    remainingMs === undefined
      ? null
      : remainingMs > 0
        ? t('instrumental.firstNoteIn', { time: formatClock(remainingMs) })
        : t('instrumental.now')

  return (
    <div className="tap-sync">
      <h3 className="outlined">{t('instrumental.tapSync')}</h3>
      {comparisonSameLength ? (
        <p className="yt-url-hint">{t('instrumental.tapSyncSkipped')}</p>
      ) : (
        <p className="yt-url-hint">{t('instrumental.tapSyncHint')}</p>
      )}

      {videoId || mock ? (
        <YouTubeMiniPlayer
          player={player}
          hostRef={player.hostRef}
          title={`${artist} — ${title}`}
          compact
          offsetMs={0}
          onOffsetChange={() => undefined}
          onUserPlay={() => setArmed(true)}
        />
      ) : null}

      <div className="tap-sync-controls">
        <button type="button" className="btn btn-primary btn-compact" onClick={() => void startSync()}>
          {taps.length > 0 ? t('instrumental.tapAgain') : t('instrumental.startSync')}
        </button>
        <button type="button" className="btn btn-ghost btn-compact" onClick={recordTap} disabled={!armed}>
          {t('instrumental.tap')}
        </button>
      </div>
      {armed && countdownLabel ? (
        <p className={remainingMs !== undefined && remainingMs <= 0 ? 'tap-sync-now outlined' : 'tap-sync-count outlined'}>
          {countdownLabel}
        </p>
      ) : null}
      {taps.length > 0 ? (
        <p className="yt-url-hint">
          {t('instrumental.taps', {
            n: taps.length,
            offset: offsetFromTap(lastTap ?? 0, firstNoteMs),
            average: offsetMs,
          })}
        </p>
      ) : (
        <p className="yt-url-current">
          {t('youtube.offset')}: {offsetMs} ms
        </p>
      )}
      <div className="tap-sync-nudge" aria-label={t('instrumental.nudge')}>
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => saveOffset(offsetMs - NUDGE_LARGE_MS)}>
          −50
        </button>
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => saveOffset(offsetMs - NUDGE_SMALL_MS)}>
          −10
        </button>
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => saveOffset(offsetMs + NUDGE_SMALL_MS)}>
          +10
        </button>
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => saveOffset(offsetMs + NUDGE_LARGE_MS)}>
          +50
        </button>
      </div>
    </div>
  )
}

