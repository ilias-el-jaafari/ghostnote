import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_NAME } from './config/brand.ts'
import {
  buildScorePlan,
  buildTimeline,
  playthrough,
  simulatedSampleAt,
  type RoundResult,
} from './game/index.ts'
import { useI18n } from './i18n/index.ts'
import { parseUltraStar, type ParsedSong } from './parser/index.ts'
import { describeParseError } from './ui/describeParseError.ts'
import { LanguageSwitcher } from './ui/LanguageSwitcher.tsx'
import { MicTest } from './ui/MicTest.tsx'
import { ResultsScreen } from './ui/ResultsScreen.tsx'
import { SingScreen } from './ui/SingScreen.tsx'
import { SongPanel } from './ui/SongPanel.tsx'
import type { SessionOptions } from './ui/useGameSession.ts'
import demoSongText from './songs/midnight-echo.txt?raw'
import './App.css'

const DEMO_SONG_NAME = 'midnight-echo.txt'

type View = 'home' | 'sing' | 'results'

type PlayFlags = {
  sim: boolean
  seekMs: number | undefined
  skipToResults: boolean
  autoplay: boolean
}

function readPlayFlags(): PlayFlags {
  if (typeof window === 'undefined') {
    return { sim: false, seekMs: undefined, skipToResults: false, autoplay: false }
  }
  const params = new URLSearchParams(window.location.search)
  const sim = params.get('sim') === '1' || params.get('sim') === 'true'
  const rawSeek = params.get('t')
  const parsedSeek = rawSeek !== null && rawSeek !== '' ? Number(rawSeek) : Number.NaN
  const seekMs = Number.isFinite(parsedSeek) ? parsedSeek : undefined
  const skipToResults = params.get('screen') === 'results'
  const autoplay = params.get('autoplay') === '1' || skipToResults || seekMs !== undefined
  return { sim, seekMs, skipToResults, autoplay }
}

function loadSong(text: string, name: string): {
  song: ParsedSong | undefined
  sourceName: string
  error: string | undefined
} {
  try {
    return { song: parseUltraStar(text), sourceName: name, error: undefined }
  } catch (caught) {
    return { song: undefined, sourceName: name, error: describeParseError(caught) }
  }
}

function perfectSimResult(song: ParsedSong): RoundResult {
  const timeline = buildTimeline(song)
  return playthrough(buildScorePlan(timeline), (time) => simulatedSampleAt(timeline, time))
}

export default function App() {
  const { t } = useI18n()
  const flags = useMemo(() => readPlayFlags(), [])
  const [state, setState] = useState(() => loadSong(demoSongText, DEMO_SONG_NAME))
  const [view, setView] = useState<View>(() => {
    if (flags.skipToResults) return 'results'
    if (flags.autoplay) return 'sing'
    return 'home'
  })
  const [simulated, setSimulated] = useState(flags.sim)
  const [seekMs, setSeekMs] = useState(flags.seekMs)
  const [guideMuted, setGuideMuted] = useState(false)
  const [result, setResult] = useState<RoundResult | undefined>(() =>
    flags.skipToResults && state.song ? perfectSimResult(state.song) : undefined,
  )

  const showSimToggle = import.meta.env.DEV || flags.sim
  const sessionOptions: SessionOptions = {
    simulated,
    seekMs,
  }

  useEffect(() => {
    document.title = `${APP_NAME} — ${t('app.tagline')}`
  }, [t])

  const onLoadText = useCallback((text: string, name: string) => {
    setState(loadSong(text, name))
    setResult(undefined)
  }, [])

  const onLoadDemo = useCallback(() => {
    setState(loadSong(demoSongText, DEMO_SONG_NAME))
    setResult(undefined)
  }, [])

  const startSinging = useCallback(() => {
    if (!state.song) return
    setSeekMs(undefined)
    setResult(undefined)
    setView('sing')
  }, [state.song])

  const onSingFinished = useCallback((next: RoundResult) => {
    setResult(next)
    setView('results')
  }, [])

  if (view === 'sing' && state.song) {
    return (
      <SingScreen
        song={state.song}
        options={sessionOptions}
        guideMuted={guideMuted}
        onToggleGuide={() => setGuideMuted((value) => !value)}
        onExit={() => setView('home')}
        onFinished={onSingFinished}
      />
    )
  }

  if (view === 'results' && state.song && result) {
    return (
      <ResultsScreen
        result={result}
        title={state.song.headers.title}
        artist={state.song.headers.artist}
        simulated={simulated}
        onAgain={startSinging}
        onHome={() => setView('home')}
      />
    )
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <p className="eyebrow">{t('app.contestLine')}</p>
          <LanguageSwitcher />
        </div>
        <h1>{t('app.name')}</h1>
        <p className="tagline">{t('app.tagline')}</p>
        <p className="lede">{t('app.lede')}</p>
      </header>

      <main className="layout">
        <SongPanel
          song={state.song}
          sourceName={state.sourceName}
          error={state.error}
          onLoadText={onLoadText}
          onLoadDemo={onLoadDemo}
        />
        <div className="home-side">
          <MicTest />
          {state.song ? (
            <div className="start-card">
              {showSimToggle ? (
                <label className="sim-toggle">
                  <input
                    type="checkbox"
                    checked={simulated}
                    onChange={(event) => setSimulated(event.target.checked)}
                  />
                  <span>
                    {t('home.simToggle')}
                    <small>{t('home.simHint')}</small>
                  </span>
                </label>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={startSinging}>
                {t('home.sing')}
              </button>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="footer">
        <p>{t('app.footer')}</p>
      </footer>
    </div>
  )
}
