import { describe, expect, it } from 'vitest'
import {
  fileName,
  fileStem,
  findAudioForChart,
  isAudioFile,
  isChartFile,
  pairSongFiles,
} from './pairFiles.ts'

describe('file helpers', () => {
  it('strips folder prefixes from Windows and POSIX paths', () => {
    expect(fileName('C:\\Songs\\Midnight Echo.txt')).toBe('Midnight Echo.txt')
    expect(fileName('songs/aqua-parade.ogg')).toBe('aqua-parade.ogg')
    expect(fileStem('songs/aqua-parade.ogg')).toBe('aqua-parade')
  })

  it('recognizes charts and audio by extension or mime', () => {
    expect(isChartFile('song.TXT')).toBe(true)
    expect(isChartFile('notes', 'text/plain')).toBe(true)
    expect(isChartFile('cover.jpg')).toBe(false)
    expect(isAudioFile('hook.MP3')).toBe(true)
    expect(isAudioFile('take', 'audio/webm')).toBe(true)
    expect(isAudioFile('notes.txt')).toBe(false)
  })
})

describe('findAudioForChart', () => {
  const files = [
    { name: 'folder/midnight-echo.ogg' },
    { name: 'folder/aqua-parade.mp3' },
  ]

  it('matches the #MP3 / #AUDIO header, even if the extension differs', () => {
    const match = findAudioForChart('midnight-echo.txt', files, 'audio/midnight-echo.mp3')
    expect(match?.file.name).toBe('folder/midnight-echo.ogg')
    expect(match?.reason).toBe('header')
  })

  it('falls back to the chart basename', () => {
    const match = findAudioForChart('aqua-parade.txt', files)
    expect(match?.file.name).toBe('folder/aqua-parade.mp3')
    expect(match?.reason).toBe('basename')
  })

  it('uses the only audio file when the batch has a single chart', () => {
    const match = findAudioForChart(
      'custom.txt',
      [{ name: 'karaoke.wav' }],
      undefined,
      { onlyChart: true },
    )
    expect(match?.reason).toBe('single')
    expect(match?.file.name).toBe('karaoke.wav')
  })

  it('does not guess when several unmatched audio files are present', () => {
    expect(findAudioForChart('other.txt', files)).toBeUndefined()
  })
})

describe('pairSongFiles', () => {
  it('pairs each chart and reports leftover audio', () => {
    const result = pairSongFiles(
      [
        { name: 'midnight-echo.txt' },
        { name: 'midnight-echo.ogg' },
        { name: 'extra.mp3' },
        { name: 'readme.md' },
      ],
      new Map([['midnight-echo.txt', 'midnight-echo.ogg']]),
    )
    expect(result.charts).toHaveLength(1)
    expect(result.charts[0]?.audio?.name).toBe('midnight-echo.ogg')
    expect(result.charts[0]?.reason).toBe('header')
    expect(result.leftoverAudio.map((file) => file.name)).toEqual(['extra.mp3'])
  })

  it('pairs a mobile one-txt-plus-one-audio pick by the single-file rule', () => {
    const result = pairSongFiles([
      { name: 'My Song.txt' },
      { name: 'track.m4a' },
    ])
    expect(result.charts[0]?.reason).toBe('single')
    expect(result.charts[0]?.audio?.name).toBe('track.m4a')
  })
})
