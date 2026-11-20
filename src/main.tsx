import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './i18n/index.ts'
import App from './App.tsx'
import { readThemePreference, resolveTheme } from './visual/themes.ts'
import './index.css'

const bootTheme = readThemePreference({
  storage: window.localStorage,
  search: window.location.search,
})
document.documentElement.dataset.theme =
  bootTheme === 'random' ? 'kaleido' : resolveTheme(bootTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
