import { describe, expect, it } from 'vitest'
import { parseUltraStar } from '../parser/index.ts'
import demoSong from './midnight-echo.txt?raw'

describe('Midnight Echo demo song', () => {
  it('parses as a valid original UltraStar file with four lyric lines', () => {
    const song = parseUltraStar(demoSong)
    expect(song.headers.title).toBe('Midnight Echo')
    expect(song.headers.artist).toBe('The Night Owls')
    expect(song.headers.audioFile).toBe('midnight-echo.ogg')
    expect(song.notes.length).toBeGreaterThan(0)
    expect(song.lines.map((line) => line.text.trim())).toEqual([
      'Midnight echo',
      'Sing with the glow',
      'Rise and shine',
      'Midnight echo',
    ])
    expect(song.notes.some((note) => note.type === 'golden')).toBe(true)
    expect(song.warnings.filter((warning) => /required|invalid/i.test(warning.message))).toEqual([])
  })
})
