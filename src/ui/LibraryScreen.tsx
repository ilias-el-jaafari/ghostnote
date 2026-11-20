import { useId, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { buildTimeline } from '../game/index.ts'
import { useI18n } from '../i18n/index.ts'
import {
  isChartFile,
  pairSongFiles,
  type LoadedSong,
} from '../library/index.ts'
import { filesFromDataTransfer, filesFromList } from '../library/collectFiles.ts'
import { parseUltraStar } from '../parser/index.ts'
import { describeParseError } from './describeParseError.ts'
import { LanguageSwitcher } from './LanguageSwitcher.tsx'
import { MicTest } from './MicTest.tsx'
import { ThemePicker } from './ThemePicker.tsx'
import type { ThemeId, ThemePreference } from '../visual/themes.ts'

type LibraryScreenProps = {
  demoSongs: LoadedSong[]
  userSongs: LoadedSong[]
  selectedId: string | undefined
  error: string | undefined
  showSimToggle: boolean
  simulated: boolean
  onSimulatedChange: (value: boolean) => void
  onSelect: (id: string) => void
  onSing: () => void
  onAddSongs: (songs: LoadedSong[]) => void
  onError: (message: string | undefined) => void
  themePreference: ThemePreference
  themeId: ThemeId
  onThemeChange: (next: ThemePreference) => void
}

function durationLabel(song: LoadedSong, template: (n: number) => string): string {
  const timeline = buildTimeline(song.song)
  return template(Math.round(timeline.lastNoteMs / 1000))
}

export function LibraryScreen({
  demoSongs,
  userSongs,
  selectedId,
  error,
  showSimToggle,
  simulated,
  onSimulatedChange,
  onSelect,
  onSing,
  onAddSongs,
  onError,
  themePreference,
  themeId,
  onThemeChange,
}: LibraryScreenProps) {
  const { t } = useI18n()
  const filesId = useId()
  const folderId = useId()
  const [dragOver, setDragOver] = useState(false)
  const selected =
    [...demoSongs, ...userSongs].find((song) => song.id === selectedId) ?? demoSongs[0]

  async function ingest(list: File[]) {
    if (list.length === 0) return
    onError(undefined)
    const charts = list.filter((file) => isChartFile(file.name, file.type))
    const headerMap = new Map<string, string | undefined>()
    const texts = new Map<string, string>()
    const errors: string[] = []
    for (const file of charts) {
      try {
        const text = await file.text()
        texts.set(file.name, text)
        headerMap.set(file.name, parseUltraStar(text).headers.audioFile)
      } catch (caught) {
        errors.push(describeParseError(caught))
      }
    }
    if (texts.size === 0) {
      onError(errors[0] ?? t('home.readError'))
      return
    }
    const paired = pairSongFiles(list, headerMap)
    const loaded: LoadedSong[] = []
    for (const item of paired.charts) {
      const text = texts.get(item.chart.name)
      if (!text) continue
      try {
        const song = parseUltraStar(text)
        const audio = item.audio
        const audioUrl = audio ? URL.createObjectURL(audio) : undefined
        loaded.push({
          id: `user-${item.chart.name}-${crypto.randomUUID()}`,
          song,
          sourceName: item.chart.name,
          audioUrl,
          audioName: audio?.name ?? song.headers.audioFile,
          audioMissing: !audioUrl,
          builtin: false,
          objectUrl: Boolean(audioUrl),
        })
      } catch (caught) {
        errors.push(describeParseError(caught))
      }
    }
    if (loaded.length > 0) onAddSongs(loaded)
    if (errors.length > 0) onError(errors[0])
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const files = filesFromList(event.target.files ?? [])
    event.target.value = ''
    await ingest(files)
  }

  async function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(false)
    const files = await filesFromDataTransfer(event.dataTransfer)
    await ingest(files)
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <p className="eyebrow outlined">{t('app.contestLine')}</p>
          <LanguageSwitcher />
        </div>
        <h1 className="outlined">{t('app.name')}</h1>
        <p className="tagline outlined">{t('app.tagline')}</p>
        <p className="lede">{t('app.lede')}</p>
      </header>

      <main className="layout">
        <section className="library">
          <h2 className="outlined">{t('home.library')}</h2>
          <p className="section-kicker">{t('home.demos')}</p>
          <div className="song-grid">
            {demoSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                selected={song.id === selected?.id}
                duration={durationLabel(song, (n) => t('home.duration', { n }))}
                onSelect={() => onSelect(song.id)}
                onSing={() => {
                  onSelect(song.id)
                  onSing()
                }}
              />
            ))}
          </div>
          {userSongs.length > 0 ? (
            <>
              <p className="section-kicker">{t('home.yourSongs')}</p>
              <div className="song-grid">
                {userSongs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    selected={song.id === selected?.id}
                    duration={durationLabel(song, (n) => t('home.duration', { n }))}
                    onSelect={() => onSelect(song.id)}
                    onSing={() => {
                      onSelect(song.id)
                      onSing()
                    }}
                  />
                ))}
              </div>
            </>
          ) : null}

          <form className="loader" onSubmit={(event) => event.preventDefault()}>
            <label
              className={dragOver ? 'dropzone dropzone-active' : 'dropzone'}
              htmlFor={filesId}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => void onDrop(event)}
            >
              <input
                id={filesId}
                type="file"
                multiple
                accept=".txt,text/plain,audio/*,.mp3,.ogg,.wav,.webm,.m4a,.flac,.aac,.opus"
                onChange={(event) => void onPick(event)}
              />
              <span className="dropzone-title">{t('home.loadFiles')}</span>
              <span className="dropzone-hint">{t('home.loadFilesHint')}</span>
            </label>
            <label className="folder-btn btn btn-ghost" htmlFor={folderId}>
              <input
                id={folderId}
                type="file"
                className="folder-input"
                multiple
                {...{ webkitdirectory: '', directory: '' }}
                onChange={(event) => void onPick(event)}
              />
              {t('home.loadFolder')}
            </label>
            <p className="folder-hint">{t('home.loadFolderHint')}</p>
          </form>

          {error ? (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          ) : null}

          {selected ? <SongDetails song={selected} /> : null}
        </section>

        <div className="home-side">
          <ThemePicker
            preference={themePreference}
            themeId={themeId}
            onChange={onThemeChange}
          />
          <MicTest />
          {selected ? (
            <div className="start-card hud-panel">
              {showSimToggle ? (
                <label className="sim-toggle">
                  <input
                    type="checkbox"
                    checked={simulated}
                    onChange={(event) => onSimulatedChange(event.target.checked)}
                  />
                  <span>
                    {t('home.simToggle')}
                    <small>{t('home.simHint')}</small>
                  </span>
                </label>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={onSing}>
                {t('home.sing')}
              </button>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="footer">
        <p>{t('app.footer')}</p>
      </footer>
    </div>
  )
}

function SongCard({
  song,
  selected,
  duration,
  onSelect,
  onSing,
}: {
  song: LoadedSong
  selected: boolean
  duration: string
  onSelect: () => void
  onSing: () => void
}) {
  const { t } = useI18n()
  return (
    <article className={selected ? 'song-card is-selected' : 'song-card'}>
      <button type="button" className="song-card-body" onClick={onSelect}>
        <h3 className="outlined">{song.song.headers.title}</h3>
        <p>{song.song.headers.artist}</p>
        <p className="song-card-meta">
          <span>{duration}</span>
          <span>{song.audioMissing ? t('home.noAudio') : t('home.audioReady')}</span>
        </p>
      </button>
      <button type="button" className="btn btn-primary btn-compact" onClick={onSing}>
        {t('home.sing')}
      </button>
    </article>
  )
}

function SongDetails({ song }: { song: LoadedSong }) {
  const { t } = useI18n()
  const showVoice = song.song.voices.length > 1
  const warning = song.audioMissing
  const details = useMemo(() => song.song, [song.song])
  return (
    <section className="panel hud-panel song-panel">
      <header className="panel-header">
        <h2 className="outlined">{details.headers.title}</h2>
        <p className="panel-kicker">{details.headers.artist}</p>
      </header>
      {warning ? (
        <p className="banner banner-warn" role="status">
          {t('home.audioMissing')}
        </p>
      ) : null}
      <dl className="meta-grid">
        <div>
          <dt>{t('home.bpm')}</dt>
          <dd>{details.headers.bpm}</dd>
        </div>
        <div>
          <dt>{t('home.gap')}</dt>
          <dd>{details.headers.gap} ms</dd>
        </div>
        <div>
          <dt>{t('home.audio')}</dt>
          <dd>{song.audioName ?? details.headers.audioFile ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('home.voices')}</dt>
          <dd>
            {details.voices
              .map((voice) => details.headers.voiceNames[voice] ?? t('home.voice', { n: voice }))
              .join(', ') || '1'}
          </dd>
        </div>
      </dl>
      {details.warnings.length > 0 ? (
        <details className="warnings">
          <summary>
            {t(
              details.warnings.length === 1 ? 'home.warnings' : 'home.warningsPlural',
              { n: details.warnings.length },
            )}
          </summary>
          <ul>
            {details.warnings.map((item, index) => (
              <li key={`${item.lineNumber}-${index}`}>
                {t('home.warningLine', { line: item.lineNumber, message: item.message })}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <h3>{t('home.lyrics')}</h3>
      <div className="lyrics">
        {details.lines.map((line, index) => (
          <p className="lyric-line" key={`${line.voice}-${line.startBeat}-${index}`}>
            {showVoice ? (
              <span className="lyric-voice">{t('home.voice', { n: line.voice })}</span>
            ) : null}
            {line.notes.map((note, noteIndex) => (
              <span
                key={`${note.startBeat}-${noteIndex}`}
                className={`syllable syllable-${note.type}`}
              >
                {note.text}
              </span>
            ))}
          </p>
        ))}
      </div>
    </section>
  )
}
