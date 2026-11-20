import { useI18n } from '../i18n/index.ts'
import {
  usePitchDetection,
  type MicErrorCode,
  type MicStatus,
} from '../pitch/usePitchDetection.ts'
import { MixSlider } from './MixSlider.tsx'

function formatHz(frequency: number | null): string {
  if (frequency === null) return '—'
  return `${frequency.toFixed(1)} Hz`
}

function flagLabel(value: boolean | undefined, t: (key: 'mic.debugOn' | 'mic.debugOff' | 'mic.debugUnknown') => string) {
  if (value === true) return t('mic.debugOn')
  if (value === false) return t('mic.debugOff')
  return t('mic.debugUnknown')
}

function statusKey(status: MicStatus, hasPitch: boolean) {
  switch (status) {
    case 'requesting':
      return 'mic.requesting' as const
    case 'listening':
      return hasPitch ? ('mic.locked' as const) : ('mic.listening' as const)
    case 'denied':
      return 'mic.denied' as const
    case 'unsupported':
      return 'mic.unsupported' as const
    case 'error':
      return 'mic.error' as const
    default:
      return 'mic.off' as const
  }
}

function errorKey(code: MicErrorCode) {
  switch (code) {
    case 'unsupported':
      return 'mic.err.unsupported' as const
    case 'denied':
      return 'mic.err.denied' as const
    case 'notFound':
      return 'mic.err.notFound' as const
    default:
      return 'mic.err.startFailed' as const
  }
}

type MicTestProps = {
  sensitivity: number
  onSensitivityChange: (value: number) => void
}

export function MicTest({ sensitivity, onSensitivityChange }: MicTestProps) {
  const { t } = useI18n()
  const {
    status,
    errorCode,
    errorDetail,
    live,
    start,
    stop,
    debugStatus,
    debugRemainingMs,
    debugBundle,
    startDebugCapture,
    downloadDebugCapture,
    diagnostics,
  } = usePitchDetection(sensitivity)
  const listening = status === 'listening'

  const level = Math.min(1, live.rms * 24)
  const cents = live.note?.cents ?? 0
  const needle = Math.max(-1, Math.min(1, cents / 50))
  const centsLabel = `${cents >= 0 ? '+' : ''}${cents.toFixed(0)}`

  return (
    <section className="panel mic-panel">
      <header className="panel-header">
        <h2>{t('mic.title')}</h2>
        <p className="panel-kicker">{t(statusKey(status, live.note !== null))}</p>
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
          {live.note ? t('mic.cents', { value: centsLabel }) : t('mic.noPitch')}
        </p>
      </div>

      <div className="meter" aria-label={t('mic.level')}>
        <span className="meter-bar" style={{ width: `${level * 100}%` }} />
      </div>

      {errorCode ? (
        <p className="banner banner-error" role="alert">
          {errorCode === 'startFailed' && errorDetail
            ? errorDetail
            : t(errorKey(errorCode))}
        </p>
      ) : (
        <p className="mic-help">{t('mic.help')}</p>
      )}

      <MixSlider
        label={t('mic.sensitivity')}
        value={sensitivity}
        onChange={onSensitivityChange}
        hint={t('mic.sensitivityHint')}
      />

      {listening ? (
        <button type="button" className="btn btn-danger" onClick={() => void stop()}>
          {t('mic.stop')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void start()}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' ? t('mic.starting') : t('mic.start')}
        </button>
      )}


      <div className="mic-debug">
        <h3>{t('mic.debugCapture')}</h3>
        <p className="mic-help">{t('mic.debugHint')}</p>
        {diagnostics ? (
          <div className="mic-settings">
            <p className="mic-settings-title">{t('mic.debugSettings')}</p>
            <dl>
              <div>
                <dt>echoCancellation</dt>
                <dd>{flagLabel(diagnostics.settings.echoCancellation, t)}</dd>
              </div>
              <div>
                <dt>noiseSuppression</dt>
                <dd>{flagLabel(diagnostics.settings.noiseSuppression, t)}</dd>
              </div>
              <div>
                <dt>autoGainControl</dt>
                <dd>{flagLabel(diagnostics.settings.autoGainControl, t)}</dd>
              </div>
              <div>
                <dt>{t('mic.debugContextRate')}</dt>
                <dd>{diagnostics.contextSampleRate} Hz</dd>
              </div>
              <div>
                <dt>{t('mic.debugTrackRate')}</dt>
                <dd>
                  {diagnostics.trackSampleRate
                    ? `${diagnostics.trackSampleRate} Hz`
                    : t('mic.debugUnknown')}
                </dd>
              </div>
              <div>
                <dt>{t('mic.debugFftSize')}</dt>
                <dd>{diagnostics.fftSize}</dd>
              </div>
              <div>
                <dt>{t('mic.debugLowCut')}</dt>
                <dd>{diagnostics.lowCutHz} Hz</dd>
              </div>
            </dl>
            {diagnostics.voiceProcessingOn ? (
              <p className="banner banner-warn" role="status">
                {t('mic.debugProcessingOn')}
              </p>
            ) : null}
          </div>
        ) : null}
        {debugStatus === 'recording' ? (
          <p className="yt-url-hint" role="status">
            {t('mic.debugRecording', { n: Math.ceil(debugRemainingMs / 1000) })}
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void startDebugCapture()}
            disabled={status === 'requesting'}
          >
            {t('mic.debugStart')}
          </button>
        )}
        {debugBundle ? (
          <button type="button" className="btn btn-primary btn-compact" onClick={() => void downloadDebugCapture()}>
            {t('mic.debugDownload')}
          </button>
        ) : null}
      </div>
    </section>
  )
}
