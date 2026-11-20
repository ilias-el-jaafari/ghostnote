import type { Locale } from '../i18n/index.ts'
import { useI18n } from '../i18n/index.ts'

const OPTIONS: { id: Locale; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'es', label: 'ES' },
]

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div className="lang-switch" role="group" aria-label={t('lang.switchTo')}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={locale === option.id ? 'lang-btn on' : 'lang-btn'}
          aria-pressed={locale === option.id}
          aria-label={t(option.id === 'en' ? 'lang.en' : 'lang.es')}
          onClick={() => setLocale(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
