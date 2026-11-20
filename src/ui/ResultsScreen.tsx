import { APP_NAME } from '../config/brand.ts'
import { MAX_LINE_BONUS, MAX_NOTE_SCORE, MAX_SCORE, type RoundResult } from '../game/index.ts'
import { useI18n } from '../i18n/index.ts'
import { LanguageSwitcher } from './LanguageSwitcher.tsx'

type ResultsScreenProps = {
  result: RoundResult
  title: string
  artist: string
  simulated: boolean
  onAgain: () => void
  onHome: () => void
}

export function ResultsScreen({
  result,
  title,
  artist,
  simulated,
  onAgain,
  onHome,
}: ResultsScreenProps) {
  const { t } = useI18n()
  const accuracy = `${Math.round(result.accuracy * 100)}%`

  return (
    <div className="results">
      <header className="results-top">
        <p className="eyebrow">{APP_NAME}</p>
        <LanguageSwitcher />
      </header>
      <p className="results-track">
        {artist} — {title}
      </p>
      <h1 className="results-heading">{t('results.title')}</h1>
      <p className="results-grade">{t(result.grade)}</p>
      <p className="results-total">
        <span className="results-total-value">{result.totalRounded.toLocaleString()}</span>
        <span className="results-total-max">{t('sing.ofMax', { max: MAX_SCORE })}</span>
      </p>
      {result.totalRounded >= MAX_SCORE ? (
        <p className="results-perfect">{t('results.perfect')}</p>
      ) : null}
      {simulated ? <p className="results-sim">{t('results.simulated')}</p> : null}

      <dl className="results-breakdown">
        <div>
          <dt>{t('results.notes')}</dt>
          <dd>
            {result.noteScoreRounded.toLocaleString()} / {MAX_NOTE_SCORE.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>{t('results.lineBonus')}</dt>
          <dd>
            {result.lineBonusRounded.toLocaleString()} / {MAX_LINE_BONUS.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>{t('results.accuracy')}</dt>
          <dd>{accuracy}</dd>
        </div>
      </dl>

      <div className="results-actions">
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          {t('results.again')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          {t('results.home')}
        </button>
      </div>
    </div>
  )
}
