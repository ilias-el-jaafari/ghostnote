import { parseUltraStar, type ParsedSong } from '../parser/index.ts'
import aquaParade from '../songs/aqua-parade.txt?raw'
import midnightEcho from '../songs/midnight-echo.txt?raw'
import skyCapsule from '../songs/sky-capsule.txt?raw'

export type CatalogEntry = {
  id: string
  sourceName: string
  audioUrl: string
  text: string
}

export type LoadedSong = {
  id: string
  song: ParsedSong
  sourceName: string
  audioUrl: string | undefined
  audioName: string | undefined
  audioMissing: boolean
  builtin: boolean
  /** True when `audioUrl` is an object URL that must be revoked on removal. */
  objectUrl: boolean
}

export const DEMO_CATALOG: CatalogEntry[] = [
  {
    id: 'midnight-echo',
    sourceName: 'midnight-echo.txt',
    audioUrl: '/songs/midnight-echo.ogg',
    text: midnightEcho,
  },
  {
    id: 'aqua-parade',
    sourceName: 'aqua-parade.txt',
    audioUrl: '/songs/aqua-parade.ogg',
    text: aquaParade,
  },
  {
    id: 'sky-capsule',
    sourceName: 'sky-capsule.txt',
    audioUrl: '/songs/sky-capsule.ogg',
    text: skyCapsule,
  },
]

export function loadCatalogEntry(entry: CatalogEntry): LoadedSong {
  const song = parseUltraStar(entry.text)
  return {
    id: entry.id,
    song,
    sourceName: entry.sourceName,
    audioUrl: entry.audioUrl,
    audioName: song.headers.audioFile ?? entry.audioUrl.split('/').pop(),
    audioMissing: false,
    builtin: true,
    objectUrl: false,
  }
}

export function loadBuiltinSongs(): LoadedSong[] {
  return DEMO_CATALOG.map(loadCatalogEntry)
}
