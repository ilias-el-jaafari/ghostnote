import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/index.ts'
import { parseYouTubeUrl } from '../youtube/ids.ts'

type YouTubeUrlFieldProps = {
  videoId: string | undefined
  fromHeader?: boolean
  onApply: (videoId: string) => void
  onClear?: () => void
}

export function YouTubeUrlField({ videoId, fromHeader, onApply, onClear }: YouTubeUrlFieldProps) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  function submit(event: FormEvent) {
    event.preventDefault()
    const id = parseYouTubeUrl(value)
    if (!id) {
      setError(t('youtube.invalidUrl'))
      return
    }
    setError(undefined)
    onApply(id)
    setValue('')
  }

  return (
    <form className="yt-url-field" onSubmit={submit}>
      <label className="yt-url-label outlined" htmlFor="yt-url-input">
        {t('youtube.pasteUrl')}
      </label>
      <div className="yt-url-row">
        <input
          id="yt-url-input"
          type="text"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(undefined)
          }}
        />
        <button type="submit" className="btn btn-primary btn-compact">
          {t('youtube.apply')}
        </button>
      </div>
      {error ? (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      ) : null}
      {videoId ? (
        <p className="yt-url-current">
          {fromHeader ? t('youtube.fromHeader') : t('youtube.usingId', { id: videoId })}
          {onClear && !fromHeader ? (
            <button type="button" className="btn btn-ghost btn-compact" onClick={onClear}>
              {t('youtube.clear')}
            </button>
          ) : null}
        </p>
      ) : (
        <p className="yt-url-hint">{t('youtube.pasteHint')}</p>
      )}
    </form>
  )
}
