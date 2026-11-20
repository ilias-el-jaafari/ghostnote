import { describe, expect, it } from 'vitest'
import { parseUltraStar } from '../parser/index.ts'
import aquaParade from './aqua-parade.txt?raw'
import midnightEcho from './midnight-echo.txt?raw'
import skyCapsule from './sky-capsule.txt?raw'

const demos = [
  {
    name: 'Midnight Echo',
    text: midnightEcho,
    artist: 'The Night Owls',
    audio: 'midnight-echo.ogg',
    lines: ['Midnight echo', 'Sing with the glow', 'Rise and shine', 'Midnight echo'],
  },
  {
    name: 'Aqua Parade',
    text: aquaParade,
    artist: 'Glass Cabinet',
    audio: 'aqua-parade.ogg',
    lines: ['Walk the water', 'Glass and skylight', 'Bubbles rise', 'to the sun'],
  },
  {
    name: 'Sky Capsule',
    text: skyCapsule,
    artist: 'The Hovering Lights',
    audio: 'sky-capsule.ogg',
    lines: ['Launch into blue', 'Soft and bright', 'Hold the line', 'Fly with me home'],
  },
]

describe('bundled demo songs', () => {
  it.each(demos)('$name parses as an original UltraStar chart with goldens', (demo) => {
    const song = parseUltraStar(demo.text)
    expect(song.headers.title).toBe(demo.name)
    expect(song.headers.artist).toBe(demo.artist)
    expect(song.headers.audioFile).toBe(demo.audio)
    expect(song.lines.map((line) => line.text.trim())).toEqual(demo.lines)
    expect(song.notes.some((note) => note.type === 'golden')).toBe(true)
    expect(song.warnings.filter((warning) => /required|invalid/i.test(warning.message))).toEqual([])
  })
})
