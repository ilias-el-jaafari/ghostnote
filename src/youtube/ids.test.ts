import { describe, expect, it } from 'vitest'
import { parseUltraStar } from '../parser/index.ts'
import { parseYouTubeHeader, parseYouTubeUrl, youtubeIdFromRawHeaders } from './ids.ts'

describe('parseYouTubeUrl', () => {
  it('accepts watch, short, embed, and bare ids', () => {
    expect(parseYouTubeUrl('abcdefghijK')).toBe('abcdefghijK')
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=abcdefghijK')).toBe('abcdefghijK')
    expect(parseYouTubeUrl('https://youtu.be/abcdefghijK?t=12')).toBe('abcdefghijK')
    expect(parseYouTubeUrl('https://www.youtube.com/embed/abcdefghijK')).toBe('abcdefghijK')
    expect(parseYouTubeUrl('https://youtube.com/shorts/abcdefghijK')).toBe('abcdefghijK')
    expect(parseYouTubeUrl('youtube.com/watch?v=abcdefghijK&list=PLxxx')).toBe('abcdefghijK')
  })

  it('rejects local file names and junk', () => {
    expect(parseYouTubeUrl('clip.mp4')).toBeUndefined()
    expect(parseYouTubeUrl('halo.jpg')).toBeUndefined()
    expect(parseYouTubeUrl('https://example.com/watch?v=abcdefghijK')).toBeUndefined()
  })
})

describe('parseYouTubeHeader — USDB key=value lists', () => {
  it('reads v= from a comma-separated #VIDEO list (made-up id)', () => {
    expect(
      parseYouTubeHeader('v=abcdeFGHIJ1,co=cover.jpg,bg=bg.jpg,preview=45.27,medley=794-2067'),
    ).toBe('abcdeFGHIJ1')
  })

  it('reads a= as an audio-only YouTube id (made-up id)', () => {
    expect(parseYouTubeHeader('a=AudioOnly_1,co=cover.jpg,bg=bg.jpg')).toBe('AudioOnly_1')
  })

  it('prefers v= over a= when both appear', () => {
    expect(parseYouTubeHeader('a=AudioOnly_1,v=VideoId_001,co=x.jpg')).toBe('VideoId_001')
  })

  it('accepts a bare v= id and ignores a local video file name', () => {
    expect(parseYouTubeHeader('v=abcdeFGHIJ1')).toBe('abcdeFGHIJ1')
    expect(parseYouTubeHeader('clip.mp4')).toBeUndefined()
    expect(parseYouTubeHeader('cover.jpg')).toBeUndefined()
  })

  it('does not mistake a cover URL for an id', () => {
    expect(
      parseYouTubeHeader(
        'a=AudioOnly_1,co=https://cdn.example.com/images/I/A1a+qRg4pGL.jpg,co-rotate=0.3',
      ),
    ).toBe('AudioOnly_1')
  })
})

describe('parseUltraStar — YouTube #VIDEO headers', () => {
  it('exposes youtubeId for a USDB-style v= list and leaves local files alone', () => {
    const youtube = parseUltraStar(
      `#TITLE:Demo
#ARTIST:Fixture
#BPM:120
#GAP:1000
#VIDEO:v=abcdeFGHIJ1,co=cover.jpg,bg=bg.jpg
: 0 4 0 La
E
`,
    )
    expect(youtube.headers.video).toBe('v=abcdeFGHIJ1,co=cover.jpg,bg=bg.jpg')
    expect(youtube.headers.youtubeId).toBe('abcdeFGHIJ1')
    expect(youtube.headers.youtubeKind).toBe('video')

    const local = parseUltraStar(
      `#TITLE:Low
#ARTIST:Bass
#BPM:100
#VIDEO:clip.mp4
: 0 4 0 La
E
`,
    )
    expect(local.headers.video).toBe('clip.mp4')
    expect(local.headers.youtubeId).toBeUndefined()
    expect(local.headers.youtubeKind).toBeUndefined()
  })

  it('exposes youtubeId for an a= audio-only header', () => {
    const parsed = parseUltraStar(
      `#TITLE:Demo
#ARTIST:Fixture
#BPM:100
#VIDEO:a=AudioOnly_1,co=cover.jpg
: 0 4 0 La
E
`,
    )
    expect(parsed.headers.youtubeId).toBe('AudioOnly_1')
    expect(parsed.headers.youtubeKind).toBe('audio')
  })

  it('does not warn that playback is unavailable when a YouTube id is present without #MP3', () => {
    const parsed = parseUltraStar(
      `#TITLE:Demo
#ARTIST:Fixture
#BPM:100
#VIDEO:v=abcdeFGHIJ1
: 0 4 0 La
E
`,
    )
    expect(parsed.headers.youtubeId).toBe('abcdeFGHIJ1')
    expect(parsed.warnings.some((warning) => /playback will not be available/i.test(warning.message))).toBe(
      false,
    )
  })
})

describe('youtubeIdFromRawHeaders', () => {
  it('falls back to #YOUTUBE if #VIDEO has no id', () => {
    expect(
      youtubeIdFromRawHeaders({
        VIDEO: 'stage.mp4',
        YOUTUBE: 'https://youtu.be/abcdefghijK',
      }),
    ).toBe('abcdefghijK')
  })
})
