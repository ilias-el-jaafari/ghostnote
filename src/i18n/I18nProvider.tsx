import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en, type MessageKey } from './en.ts'
import { es } from './es.ts'
import {
  detectLocale,
  interpolate,
  persistLocale,
  type Locale,
} from './locale.ts'

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, es }

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale())

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    persistLocale(next)
    if (typeof document !== 'undefined') document.documentElement.lang = next
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const table = dictionaries[locale]
      return interpolate(table[key] ?? en[key] ?? key, vars)
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
