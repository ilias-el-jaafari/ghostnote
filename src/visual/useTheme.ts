import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  type ThemeId,
  type ThemePreference,
} from './themes.ts'

/** Stable library preview while the preference is "random each song". */
export const LIBRARY_PREVIEW_THEME: ThemeId = 'kaleido'

export type ThemeState = {
  preference: ThemePreference
  themeId: ThemeId
  locked: boolean
  setPreference: (next: ThemePreference) => void
  prepareForSong: () => ThemeId
}

function shouldResolveImmediately(search: string): boolean {
  const params = new URLSearchParams(search)
  return (
    params.get('autoplay') === '1' ||
    params.get('screen') === 'results' ||
    (params.get('t') !== null && params.get('t') !== '')
  )
}

function readBoot(): {
  preference: ThemePreference
  locked: boolean
  initial: ThemeId
} {
  if (typeof window === 'undefined') {
    return { preference: 'random', locked: false, initial: LIBRARY_PREVIEW_THEME }
  }
  const search = window.location.search
  const preference = readThemePreference({
    storage: window.localStorage,
    search,
  })
  const locked = Boolean(new URLSearchParams(search).get('theme'))
  const initial =
    preference === 'random' && !shouldResolveImmediately(search)
      ? LIBRARY_PREVIEW_THEME
      : resolveTheme(preference)
  return { preference, locked, initial }
}

function applyDocumentTheme(id: ThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = id
}

export function useTheme(): ThemeState {
  const boot = useMemo(() => readBoot(), [])
  const [preference, setPreferenceState] = useState<ThemePreference>(boot.preference)
  const [themeId, setThemeId] = useState<ThemeId>(boot.initial)
  const lastRef = useRef<ThemeId>(boot.initial)
  const locked = boot.locked

  useEffect(() => {
    applyDocumentTheme(themeId)
  }, [themeId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const current = window.__GHOSTNOTE_VISUAL__
    window.__GHOSTNOTE_VISUAL__ = {
      fps: current?.fps ?? 0,
      quality: current?.quality ?? 'medium',
      theme: themeId,
    }
  }, [themeId])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next)
      if (!locked && typeof window !== 'undefined') {
        persistThemePreference(next, window.localStorage)
      }
      if (next !== 'random') {
        lastRef.current = next
        setThemeId(next)
      }
    },
    [locked],
  )

  const prepareForSong = useCallback(() => {
    const next = resolveTheme(preference, {
      rng: Math.random,
      exclude: lastRef.current,
    })
    lastRef.current = next
    setThemeId(next)
    applyDocumentTheme(next)
    return next
  }, [preference])

  return { preference, themeId, locked, setPreference, prepareForSong }
}
