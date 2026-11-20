import { useI18n } from '../i18n/index.ts'
import { THEME_IDS, THEMES, type ThemeId, type ThemePreference } from '../visual/themes.ts'

type ThemePickerProps = {
  preference: ThemePreference
  themeId: ThemeId
  onChange: (next: ThemePreference) => void
}

export function ThemePicker({ preference, themeId, onChange }: ThemePickerProps) {
  const { t } = useI18n()
  return (
    <section className="theme-picker hud-panel" aria-labelledby="theme-picker-title">
      <h2 id="theme-picker-title" className="outlined">
        {t('theme.title')}
      </h2>
      <p className="theme-picker-hint">{t('theme.hint')}</p>
      <div className="theme-swatches">
        {THEME_IDS.map((id) => {
          const selected = preference === id
          return (
            <button
              key={id}
              type="button"
              className={selected ? 'theme-swatch is-selected' : 'theme-swatch'}
              data-theme-preview={id}
              aria-pressed={selected}
              onClick={() => onChange(id)}
            >
              <span className="theme-swatch-preview" aria-hidden="true" />
              <span className="theme-swatch-name outlined">{t(THEMES[id].nameKey)}</span>
            </button>
          )
        })}
      </div>
      <label className="theme-random">
        <input
          type="checkbox"
          checked={preference === 'random'}
          onChange={(event) => onChange(event.target.checked ? 'random' : themeId)}
        />
        <span>{t('theme.random')}</span>
      </label>
    </section>
  )
}
