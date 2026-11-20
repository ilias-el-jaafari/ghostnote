import { useEffect, useState } from 'react'
import { APP_NAME } from '../config/brand.ts'
import { useI18n } from '../i18n/index.ts'

const INTRO_MS = 2200
const STORAGE_KEY = 'ghostnote-intro-seen'

function shouldPlay(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('intro') === '0' || params.get('intro') === 'skip') return false
  if (params.get('sim') || params.get('screen') || params.get('autoplay') || params.get('t')) {
    return false
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== '1'
  } catch {
    return true
  }
}

type WakeIntroProps = {
  enabled?: boolean
}

export function WakeIntro({ enabled = true }: WakeIntroProps) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(() => enabled && shouldPlay())

  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => dismiss(), INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  function dismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Ignore quota / private-mode failures.
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <button type="button" className="wake-intro" onClick={dismiss} aria-label={t('intro.skip')}>
      <span className="wake-scanlines" />
      <span className="wake-flash" />
      <span className="wake-logo">
        <span className="wake-kicker">{t('intro.wake')}</span>
        <span className="wake-name">{APP_NAME}</span>
      </span>
      <span className="wake-skip">{t('intro.skip')}</span>
    </button>
  )
}
