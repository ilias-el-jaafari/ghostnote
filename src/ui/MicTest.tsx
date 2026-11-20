import { usePitchDetection } from '../pitch/usePitchDetection.ts'

function formatHz(frequency: number | null): string {
  if (frequency === null) return '—'
  return `${frequency.toFixed(1)} Hz`
}

function statusLabel(status: string, hasPitch: boolean): string {
  switch (status) {
    case 'requesting':
      return 'Waiting for microphone permission…'
    case 'listening':
      return hasPitch ? 'Pitch locked' : 'Listening — sing a steady note'
    case 'denied':
      return 'Permission denied'
    case 'unsupported':
      return 'Microphone not supported'
    case 'error':
      return 'Microphone error'
    default:
      return 'Mic is off'
  }
}

export function MicTest() {
  const { status, errorMessage, live, start, stop } = usePitchDetection()
  const listening = status === 'listening'
  const level = Math.min(1, live.rms * 8)
  const cents = live.note?.cents ?? 0
  const needle = Math.max(-1, Math.min(1, cents / 50))

  return (
    <section className="panel mic-panel">
      <header className="panel-header">
        <h2>Microphone test</h2>
        <p className="panel-kicker">{statusLabel(status, live.note !== null)}</p>
      </header>

      <div className="tuner" aria-live="polite">
        <p className={live.note ? 'tuner-note' : 'tuner-note tuner-note-empty'}>
          {live.note?.label ?? '—'}
        </p>
        <p className="tuner-hz">{formatHz(live.frequency)}</p>
        <div className="cents-track" aria-hidden="true">
          <span className="cents-mark cents-left">−50</span>
          <span className="cents-center" />
          <span
            className={listening && live.note ? 'cents-needle on' : 'cents-needle'}
            style={{ transform: `translateX(${needle * 100}%)` }}
          />
          <span className="cents-mark cents-right">+50</span>
        </div>
        <p className="tuner-cents">
          {live.note
            ? `${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cents`
            : 'No pitch yet'}
        </p>
      </div>

      <div className="meter" aria-label="Input level">
        <span className="meter-bar" style={{ width: `${level * 100}%` }} />
      </div>

      {errorMessage ? (
        <p className="banner banner-error" role="alert">
          {errorMessage}
        </p>
      ) : (
        <p className="mic-help">
          On a phone, this page must be served over HTTPS (or localhost) and you
          have to start the mic with a tap. If the permission prompt does not
          appear, check the site settings for the microphone.
        </p>
      )}

      {listening ? (
        <button type="button" className="btn btn-danger" onClick={() => void stop()}>
          Stop microphone
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void start()}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' ? 'Requesting…' : 'Start microphone'}
        </button>
      )}
    </section>
  )
}
