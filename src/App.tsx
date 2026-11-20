import { useCallback, useState } from 'react'
import { parseUltraStar, type ParsedSong } from './parser/index.ts'
import { describeParseError } from './ui/describeParseError.ts'
import { SongPanel } from './ui/SongPanel.tsx'
import { MicTest } from './ui/MicTest.tsx'
import demoSongText from './songs/midnight-echo.txt?raw'
import './App.css'

const DEMO_SONG_NAME = 'midnight-echo.txt'

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

export default function App() {
  const [state, setState] = useState(() => loadSong(demoSongText, DEMO_SONG_NAME))

  const onLoadText = useCallback((text: string, name: string) => {
    setState(loadSong(text, name))
  }, [])

  const onLoadDemo = useCallback(() => {
    setState(loadSong(demoSongText, DEMO_SONG_NAME))
  }, [])

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Kiroween 2026 · Resurrection</p>
        <h1>WakeStar</h1>
        <p className="tagline">UltraStar karaoke, reborn in the browser.</p>
        <p className="lede">
          Phase 1: load a song file, read the lyrics, and check that your
          microphone can hear a note. Built for a party with friends, on a
          computer or a phone.
        </p>
      </header>

      <main className="layout">
        <SongPanel
          song={state.song}
          sourceName={state.sourceName}
          error={state.error}
          onLoadText={onLoadText}
          onLoadDemo={onLoadDemo}
        />
        <MicTest />
      </main>

      <footer className="footer">
        <p>Phase 1 of 5 · no scoring yet · demo song is original and copyright-free</p>
      </footer>
    </div>
  )
}
