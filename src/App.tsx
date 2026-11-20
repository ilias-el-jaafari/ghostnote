import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAudioMix } from './audio/useAudioMix.ts'
import { APP_NAME } from './config/brand.ts'
import {
  buildScorePlan,
  buildTimeline,
  playthrough,
  simulatedSampleAt,
  type RoundResult,
} from './game/index.ts'
import { useI18n } from './i18n/index.ts'
import { loadBuiltinSongs, type LoadedSong } from './library/index.ts'
import { parseYouTubeUrl } from './youtube/ids.ts'
import { ResultsScreen } from './ui/ResultsScreen.tsx'
import { SingScreen } from './ui/SingScreen.tsx'
import { LibraryScreen } from './ui/LibraryScreen.tsx'
import type { SessionOptions } from './ui/useGameSession.ts'
import { MilkDropBackground } from './visual/MilkDropBackground.tsx'
import { useTheme } from './visual/useTheme.ts'
import { WakeIntro } from './visual/WakeIntro.tsx'
import { useVisualQuality } from './visual/useVisualQuality.ts'
import './App.css'

type View = 'home' | 'sing' | 'results'

type PlayFlags = {
  sim: boolean
  seekMs: number | undefined
  skipToResults: boolean
  autoplay: boolean
  ytMock: boolean
  ytId: string | undefined
}

function readPlayFlags(): PlayFlags {
  if (typeof window === 'undefined') {
    return { sim: false, seekMs: undefined, skipToResults: false, autoplay: false, ytMock: false, ytId: undefined }
  }
  const params = new URLSearchParams(window.location.search)
  const sim = params.get('sim') === '1' || params.get('sim') === 'true'
  const rawSeek = params.get('t')
  const parsedSeek = rawSeek !== null && rawSeek !== '' ? Number(rawSeek) : Number.NaN
  const seekMs = Number.isFinite(parsedSeek) ? parsedSeek : undefined
  const skipToResults = params.get('screen') === 'results'
  const autoplay = params.get('autoplay') === '1' || skipToResults || seekMs !== undefined
  const ytMock = params.get('ytmock') === '1' || params.get('ytmock') === 'true'
  const ytId = parseYouTubeUrl(params.get('yt') ?? '')
  return { sim, seekMs, skipToResults, autoplay, ytMock, ytId }
}

function perfectSimResult(song: LoadedSong['song']): RoundResult {
  const timeline = buildTimeline(song)
  return playthrough(buildScorePlan(timeline), (time) => simulatedSampleAt(timeline, time))
}

export default function App() {
  const { t } = useI18n()
  const visual = useVisualQuality()
  const theme = useTheme()
  const prepareForSong = theme.prepareForSong
  const flags = useMemo(() => readPlayFlags(), [])
  const builtin = useMemo(() => loadBuiltinSongs(), [])
  const [userSongs, setUserSongs] = useState<LoadedSong[]>([])
  const [selectedId, setSelectedId] = useState(builtin[0]?.id)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [view, setView] = useState<View>(() => {
    if (flags.skipToResults) return 'results'
    if (flags.autoplay) return 'sing'
    return 'home'
  })
  const [simulated, setSimulated] = useState(flags.sim)
  const [seekMs, setSeekMs] = useState(flags.seekMs)
  const [guideMuted, setGuideMuted] = useState(false)
  const mix = useAudioMix()
  const [youtubeOverrides, setYoutubeOverrides] = useState<Record<string, string>>({})
  const songs = useMemo(() => [...builtin, ...userSongs], [builtin, userSongs])
  const selectedBase = songs.find((song) => song.id === selectedId) ?? songs[0]
  const selected = selectedBase
    ? {
        ...selectedBase,
        youtubeId:
          youtubeOverrides[selectedBase.id] ??
          flags.ytId ??
          selectedBase.youtubeId,
        youtubeFromHeader: youtubeOverrides[selectedBase.id] || flags.ytId
          ? false
          : selectedBase.youtubeFromHeader,
      }
    : undefined
  const [result, setResult] = useState<RoundResult | undefined>(() =>
    flags.skipToResults && builtin[0] ? perfectSimResult(builtin[0].song) : undefined,
  )

  const showSimToggle = import.meta.env.DEV || flags.sim
  const sessionOptions: SessionOptions = useMemo(
    () => ({ simulated, seekMs }),
    [seekMs, simulated],
  )

  useEffect(() => {
    document.title = `${APP_NAME} — ${t('app.tagline')}`
  }, [t])

  const startSinging = useCallback(() => {
    if (!selectedBase) return
    prepareForSong()
    setSeekMs(undefined)
    setResult(undefined)
    setView('sing')
  }, [selectedBase, prepareForSong])

  const onSingFinished = useCallback((next: RoundResult) => {
    setResult(next)
    setView('results')
  }, [])

  const onYouTubeSource = useCallback((songId: string, videoId: string | undefined) => {
    setYoutubeOverrides((current) => {
      const next = { ...current }
      if (videoId) next[songId] = videoId
      else delete next[songId]
      return next
    })
  }, [])

  const onAddSongs = useCallback((incoming: LoadedSong[]) => {
    setUserSongs((current) => [...current, ...incoming])
    const last = incoming[incoming.length - 1]
    if (last) setSelectedId(last.id)
  }, [])

  const stage = (
    <>
      <MilkDropBackground
        settings={visual.settings}
        themeId={theme.themeId}
        onFps={visual.reportFps}
      />
      <WakeIntro />
    </>
  )

  if (view === 'sing' && selected) {
    return (
      <>
        {stage}
        <SingScreen
          song={selected.song}
          audioUrl={selected.audioUrl}
          audioMissing={selected.audioMissing && !selected.youtubeId && !flags.ytMock}
          options={sessionOptions}
          youtubeId={selected.youtubeId}
          youtubeFromHeader={selected.youtubeFromHeader}
          youtubeMock={flags.ytMock}
          guideMuted={guideMuted}
          guideVolume={mix.guideVolume}
          micSensitivity={mix.micSensitivity}
          visual={visual.settings}
          themeId={theme.themeId}
          onToggleGuide={() => setGuideMuted((value) => !value)}
          onGuideVolume={mix.setGuideVolume}
          onMicSensitivity={mix.setMicSensitivity}
          onExit={() => setView('home')}
          onFinished={onSingFinished}
        />
      </>
    )
  }

  if (view === 'results' && selected && result) {
    return (
      <>
        {stage}
        <ResultsScreen
          result={result}
          title={selected.song.headers.title}
          artist={selected.song.headers.artist}
          simulated={simulated}
          onAgain={startSinging}
          onHome={() => setView('home')}
        />
      </>
    )
  }

  return (
    <>
      {stage}
      <LibraryScreen
        demoSongs={builtin}
        userSongs={userSongs}
        selectedId={selected?.id}
        error={loadError}
        showSimToggle={showSimToggle}
        simulated={simulated}
        onSimulatedChange={setSimulated}
        onSelect={setSelectedId}
        onSing={startSinging}
        onAddSongs={onAddSongs}
        onError={setLoadError}
        themePreference={theme.preference}
        themeId={theme.themeId}
        onThemeChange={theme.setPreference}
        guideVolume={mix.guideVolume}
        micSensitivity={mix.micSensitivity}
        onGuideVolume={mix.setGuideVolume}
        onMicSensitivity={mix.setMicSensitivity}
        onYouTubeSource={onYouTubeSource}
      />
    </>
  )
}
