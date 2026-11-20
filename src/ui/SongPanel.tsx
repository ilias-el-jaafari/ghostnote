import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { useId, useState } from 'react'
import { useI18n } from '../i18n/index.ts'
import type { LyricLine, ParsedSong } from '../parser/index.ts'

type SongPanelProps = {
  song: ParsedSong | undefined
  sourceName: string | undefined
  error: string | undefined
  onLoadText: (text: string, sourceName: string) => void
  onLoadDemo: () => void
}

function LineView({ line, showVoice }: { line: LyricLine; showVoice: boolean }) {
  const { t } = useI18n()
  return (
    <p className="lyric-line">
      {showVoice ? (
        <span className="lyric-voice">
          {t('home.voice', { n: line.voice })}
        </span>
      ) : null}
      {line.notes.map((note, index) => (
        <span
          key={`${note.startBeat}-${index}`}
          className={`syllable syllable-${note.type}`}
          title={`${note.type} · beat ${note.startBeat} · pitch ${note.pitch}`}
        >
          {note.text}
        </span>
      ))}
    </p>
  )
}

export function SongPanel({
  song,
  sourceName,
  error,
  onLoadText,
  onLoadDemo,
}: SongPanelProps) {
  const { t } = useI18n()
  const inputId = useId()
  const [dragOver, setDragOver] = useState(false)
  const [readError, setReadError] = useState<string | undefined>(undefined)

  const displayError = error ?? readError

  async function loadFile(file: File | undefined) {
    if (!file) return
    setReadError(undefined)
    try {
      const text = await file.text()
      onLoadText(text, file.name)
    } catch (caught) {
      setReadError(caught instanceof Error ? caught.message : t('home.readError'))
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    void loadFile(file)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    void loadFile(file)
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(true)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
  }

  return (
    <section className="panel song-panel">
      <header className="panel-header">
        <h2>{t('home.song')}</h2>
        {sourceName ? <p className="panel-kicker">{sourceName}</p> : null}
      </header>

      <form className="loader" onSubmit={onSubmit}>
        <label
          className={dragOver ? 'dropzone dropzone-active' : 'dropzone'}
          htmlFor={inputId}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            id={inputId}
            type="file"
            accept=".txt,text/plain"
            onChange={onPick}
          />
          <span className="dropzone-title">{t('home.loadFile')}</span>
          <span className="dropzone-hint">{t('home.loadFileHint')}</span>
        </label>
        <button type="button" className="btn btn-ghost" onClick={onLoadDemo}>
          {t('home.loadDemo')}
        </button>
      </form>

      {displayError ? (
        <p className="banner banner-error" role="alert">
          {displayError}
        </p>
      ) : null}

      {song ? (
        <div className="song-body">
          <dl className="meta-grid">
            <div>
              <dt>{t('home.title')}</dt>
              <dd>{song.headers.title}</dd>
            </div>
            <div>
              <dt>{t('home.artist')}</dt>
              <dd>{song.headers.artist}</dd>
            </div>
            <div>
              <dt>{t('home.bpm')}</dt>
              <dd>{song.headers.bpm}</dd>
            </div>
            <div>
              <dt>{t('home.gap')}</dt>
              <dd>{song.headers.gap} ms</dd>
            </div>
            <div>
              <dt>{t('home.audio')}</dt>
              <dd>{song.headers.audioFile ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('home.voices')}</dt>
              <dd>
                {song.voices
                  .map((voice) => song.headers.voiceNames[voice] ?? t('home.voice', { n: voice }))
                  .join(', ') || '1'}
              </dd>
            </div>
          </dl>

          {song.warnings.length > 0 ? (
            <details className="warnings">
              <summary>
                {t(
                  song.warnings.length === 1 ? 'home.warnings' : 'home.warningsPlural',
                  { n: song.warnings.length },
                )}
              </summary>
              <ul>
                {song.warnings.map((warning, index) => (
                  <li key={`${warning.lineNumber}-${index}`}>
                    {t('home.warningLine', {
                      line: warning.lineNumber,
                      message: warning.message,
                    })}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <h3>{t('home.lyrics')}</h3>
          <div className="lyrics">
            {song.lines.map((line, index) => (
              <LineView
                key={`${line.voice}-${line.startBeat}-${index}`}
                line={line}
                showVoice={song.voices.length > 1}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
