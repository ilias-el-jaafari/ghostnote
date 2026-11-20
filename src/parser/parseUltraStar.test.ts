import { describe, expect, it } from 'vitest'
import {
  beatToMs,
  parseDecimal,
  parseUltraStar,
  UltraStarParseError,
} from './parseUltraStar.ts'

const MINIMAL = `#TITLE:Midnight Echo
#ARTIST:The Night Owls
#BPM:120
#GAP:0
#MP3:midnight-echo.ogg
: 0 4 0 Mid
: 4 4 2 night
E
`

function song(body: string): string {
  return `#TITLE:Test Song
#ARTIST:Tester
#BPM:120
${body}`
}

describe('parseDecimal', () => {
  it('parses period and comma decimals', () => {
    expect(parseDecimal('10.5')).toBe(10.5)
    expect(parseDecimal('10,5')).toBe(10.5)
    expect(parseDecimal('  320  ')).toBe(320)
  })

  it('rejects malformed numbers', () => {
    expect(Number.isNaN(parseDecimal(''))).toBe(true)
    expect(Number.isNaN(parseDecimal('12.3.4'))).toBe(true)
    expect(Number.isNaN(parseDecimal('10,5,0'))).toBe(true)
    expect(Number.isNaN(parseDecimal('abc'))).toBe(true)
    expect(Number.isNaN(parseDecimal('12px'))).toBe(true)
  })
})

describe('beatToMs', () => {
  it('uses the implicit *4 multiplier for unversioned and v1 files', () => {
    // 120 BPM, beat 4, no gap: 4 * 60000 / (120 * 4) = 500ms
    expect(beatToMs(4, 120, 0)).toBe(500)
    expect(beatToMs(4, 120, 0, '1.0.0')).toBe(500)
  })

  it('adds the GAP offset in milliseconds', () => {
    expect(beatToMs(0, 120, 1000)).toBe(1000)
    expect(beatToMs(4, 120, 1000)).toBe(1500)
  })

  it('does not quadruple BPM for format v2', () => {
    // 120 BPM, beat 4, no gap: 4 * 60000 / 120 = 2000ms
    expect(beatToMs(4, 120, 0, '2.0.0')).toBe(2000)
  })

  it('matches the official v1 example: 10.5 BPM means 42 beats per minute', () => {
    // one beat = 60000 / (10.5 * 4) = 60000 / 42 ms
    expect(beatToMs(1, 10.5, 0, '1.0.0')).toBeCloseTo(60_000 / 42, 10)
  })

  it('throws when BPM is not positive', () => {
    expect(() => beatToMs(1, 0, 0)).toThrow(UltraStarParseError)
    expect(() => beatToMs(1, -8, 0)).toThrow(UltraStarParseError)
  })
})

describe('parseUltraStar — happy path', () => {
  it('parses required headers, notes, and lyrics from a typical file', () => {
    const parsed = parseUltraStar(MINIMAL)
    expect(parsed.headers.title).toBe('Midnight Echo')
    expect(parsed.headers.artist).toBe('The Night Owls')
    expect(parsed.headers.bpm).toBe(120)
    expect(parsed.headers.gap).toBe(0)
    expect(parsed.headers.audioFile).toBe('midnight-echo.ogg')
    expect(parsed.notes).toHaveLength(2)
    expect(parsed.notes[0]).toMatchObject({
      type: 'regular',
      typeChar: ':',
      startBeat: 0,
      duration: 4,
      pitch: 0,
      text: 'Mid',
      voice: 1,
    })
    expect(parsed.notes[1]).toMatchObject({
      type: 'regular',
      startBeat: 4,
      duration: 4,
      pitch: 2,
      text: 'night',
    })
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.lines[0]?.text).toBe('Midnight')
    expect(parsed.voices).toEqual([1])
  })

  it('parses all standard note types and golden / rap / freestyle', () => {
    const parsed = parseUltraStar(
      song(`: 0 4 0 a
* 4 4 2 b
R 8 4 0 c
G 12 4 0 d
F 16 4 0 e
E
`),
    )
    expect(parsed.notes.map((note) => note.type)).toEqual([
      'regular',
      'golden',
      'rap',
      'goldenRap',
      'freestyle',
    ])
  })

  it('preserves leading spaces in syllable text as word separators', () => {
    const parsed = parseUltraStar(
      song(`: 0 4 0 Hello
: 8 4 0  world
E
`),
    )
    expect(parsed.lines[0]?.text).toBe('Hello world')
    expect(parsed.notes[1]?.text).toBe(' world')
  })

  it('splits lyric lines on phrase breaks and supports a legacy second beat', () => {
    const parsed = parseUltraStar(
      song(`: 0 6 2 Hel
: 8 4 4 lo
: 14 4 7  world
- 20
: 22 6 2 po
* 30 4 5 ny
- 40 48
: 50 4 0 end
E
`),
    )
    expect(parsed.breaks).toHaveLength(2)
    expect(parsed.breaks[0]).toMatchObject({ startBeat: 20, endBeat: undefined })
    expect(parsed.breaks[1]).toMatchObject({ startBeat: 40, endBeat: 48 })
    expect(parsed.lines.map((line) => line.text)).toEqual([
      'Hello world',
      'pony',
      'end',
    ])
  })

  it('accepts comma decimals, CRLF, a UTF-8 BOM, and case-insensitive headers', () => {
    const raw =
      '\uFEFF#title:Comma Song\r\n#Artist:Act\r\n#bpm:10,5\r\n#gap:1000,0\r\n: 0 4 0 Hi\r\nE\r\n'
    const parsed = parseUltraStar(raw)
    expect(parsed.headers.title).toBe('Comma Song')
    expect(parsed.headers.artist).toBe('Act')
    expect(parsed.headers.bpm).toBe(10.5)
    expect(parsed.headers.gap).toBe(1000)
  })

  it('keeps header values that contain colons and trims whitespace', () => {
    const parsed = parseUltraStar(
      `#TITLE:  Hello: The Remix  \n#ARTIST:Band\n#BPM:100\n: 0 1 0 x\nE\n`,
    )
    expect(parsed.headers.title).toBe('Hello: The Remix')
  })

  it('prefers #AUDIO over #MP3 and records both in raw headers', () => {
    const parsed = parseUltraStar(
      `#TITLE:A\n#ARTIST:B\n#BPM:100\n#MP3:old.mp3\n#AUDIO:new.ogg\n: 0 1 0 x\nE\n`,
    )
    expect(parsed.headers.audioFile).toBe('new.ogg')
    expect(parsed.headers.raw.MP3).toBe('old.mp3')
    expect(parsed.headers.raw.AUDIO).toBe('new.ogg')
  })

  it('treats an empty header value as absent and ignores unknown headers', () => {
    const parsed = parseUltraStar(
      `#TITLE:A\n#ARTIST:B\n#BPM:100\n#YEAR:\n#FOO-BAR:custom\n#GENRE:Pop\n: 0 1 0 x\nE\n`,
    )
    expect(parsed.headers.year).toBeUndefined()
    expect(parsed.headers.genre).toBe('Pop')
    expect(parsed.headers.raw['FOO-BAR']).toBe('custom')
  })

  it('ignores everything after the E marker and blank lines everywhere', () => {
    const parsed = parseUltraStar(
      `#TITLE:A\n\n#ARTIST:B\n#BPM:100\n\n: 0 1 0 x\nE\n: 8 1 0 ignored\n#TITLE:Nope\n`,
    )
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.headers.title).toBe('A')
  })

  it('defaults GAP to 0 and accepts a file that omits the trailing E with a warning', () => {
    const parsed = parseUltraStar(`#TITLE:A\n#ARTIST:B\n#BPM:90\n: 0 1 0 x\n`)
    expect(parsed.headers.gap).toBe(0)
    expect(parsed.warnings.some((warning) => /end with an E/i.test(warning.message))).toBe(
      true,
    )
  })

  it('parses negative pitches (below C4) and optional metadata headers', () => {
    const parsed = parseUltraStar(
      `#TITLE:Low\n#ARTIST:Bass\n#BPM:100\n#YEAR:2026\n#LANGUAGE:English\n#COVER:cover.jpg\n#VIDEO:clip.mp4\n#BACKGROUND:bg.jpg\n: 0 4 -2 A#3\nE\n`,
    )
    expect(parsed.notes[0]?.pitch).toBe(-2)
    expect(parsed.headers.year).toBe('2026')
    expect(parsed.headers.language).toBe('English')
    expect(parsed.headers.cover).toBe('cover.jpg')
    expect(parsed.headers.video).toBe('clip.mp4')
    expect(parsed.headers.youtubeId).toBeUndefined()
    expect(parsed.headers.background).toBe('bg.jpg')
  })
})

describe('parseUltraStar — duets', () => {
  it('assigns notes after P1/P2 to the matching voice and reads singer names', () => {
    const parsed = parseUltraStar(
      `#TITLE:Duet
#ARTIST:Pair
#BPM:100
#P1:Luna
#P2:Sol
P1
: 0 4 0 Hello
: 8 4 2  world
- 16
P2
: 0 4 4 Good
: 8 4 5  night
E
`,
    )
    expect(parsed.headers.voiceNames).toEqual({ 1: 'Luna', 2: 'Sol' })
    expect(parsed.voices).toEqual([1, 2])
    expect(parsed.notes.filter((note) => note.voice === 1).map((note) => note.text)).toEqual([
      'Hello',
      ' world',
    ])
    expect(parsed.notes.filter((note) => note.voice === 2).map((note) => note.text)).toEqual([
      'Good',
      ' night',
    ])
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines[0]).toMatchObject({ voice: 1, text: 'Hello world' })
    expect(parsed.lines[1]).toMatchObject({ voice: 2, text: 'Good night' })
  })

  it('accepts a space in "P 2" and prefers #P2 over #DUETSINGERP2', () => {
    const parsed = parseUltraStar(
      `#TITLE:Duet
#ARTIST:Pair
#BPM:100
#DUETSINGERP1:Old One
#DUETSINGERP2:Old Two
#P1:New One
#P2:New Two
P1
: 0 4 0 A
P 2
: 0 4 0 B
E
`,
    )
    expect(parsed.headers.voiceNames).toEqual({ 1: 'New One', 2: 'New Two' })
    expect(parsed.notes[1]?.voice).toBe(2)
  })

  it('implicitly uses voice 1 when no player change is present', () => {
    const parsed = parseUltraStar(MINIMAL)
    expect(parsed.notes.every((note) => note.voice === 1)).toBe(true)
  })

  it('supports voices up to P9', () => {
    const parsed = parseUltraStar(
      song(`P9\n: 0 4 0 nine\nE\n`),
    )
    expect(parsed.notes[0]?.voice).toBe(9)
    expect(parsed.voices).toEqual([9])
  })
})

describe('parseUltraStar — malformed input', () => {
  it('throws on an empty or whitespace-only file', () => {
    expect(() => parseUltraStar('')).toThrow(UltraStarParseError)
    expect(() => parseUltraStar('  \n\n  ')).toThrow(/empty/i)
  })

  it('throws when required headers are missing', () => {
    expect(() => parseUltraStar('#ARTIST:A\n#BPM:100\n: 0 1 0 x\nE\n')).toThrow(
      /#TITLE/,
    )
    expect(() => parseUltraStar('#TITLE:T\n#BPM:100\n: 0 1 0 x\nE\n')).toThrow(
      /#ARTIST/,
    )
    expect(() => parseUltraStar('#TITLE:T\n#ARTIST:A\n: 0 1 0 x\nE\n')).toThrow(
      /#BPM/,
    )
  })

  it('throws on invalid BPM and GAP values', () => {
    expect(() =>
      parseUltraStar('#TITLE:T\n#ARTIST:A\n#BPM:0\n: 0 1 0 x\nE\n'),
    ).toThrow(/BPM/)
    expect(() =>
      parseUltraStar('#TITLE:T\n#ARTIST:A\n#BPM:-12\n: 0 1 0 x\nE\n'),
    ).toThrow(/BPM/)
    expect(() =>
      parseUltraStar('#TITLE:T\n#ARTIST:A\n#BPM:fast\n: 0 1 0 x\nE\n'),
    ).toThrow(/BPM/)
    expect(() =>
      parseUltraStar('#TITLE:T\n#ARTIST:A\n#BPM:100\n#GAP:-5\n: 0 1 0 x\nE\n'),
    ).toThrow(/GAP/)
    expect(() =>
      parseUltraStar('#TITLE:T\n#ARTIST:A\n#BPM:100\n#GAP:soon\n: 0 1 0 x\nE\n'),
    ).toThrow(/GAP/)
  })

  it('throws on an invalid or unsupported #VERSION', () => {
    expect(() =>
      parseUltraStar('#VERSION:banana\n#TITLE:T\n#ARTIST:A\n#BPM:100\n: 0 1 0 x\nE\n'),
    ).toThrow(/VERSION/)
    expect(() =>
      parseUltraStar('#VERSION:3.0.0\n#TITLE:T\n#ARTIST:A\n#BPM:100\n: 0 1 0 x\nE\n'),
    ).toThrow(/Unsupported/)
    expect(() =>
      parseUltraStar('#VERSION:0.1.0\n#TITLE:T\n#ARTIST:A\n#BPM:100\n: 0 1 0 x\nE\n'),
    ).toThrow(/VERSION/)
  })

  it('accepts v1 and v2 version headers', () => {
    const v1 = parseUltraStar(
      '#VERSION:1.1.0\n#TITLE:T\n#ARTIST:A\n#BPM:100\n: 0 1 0 x\nE\n',
    )
    const v2 = parseUltraStar(
      '#VERSION:2.0.0\n#TITLE:T\n#ARTIST:A\n#BPM:100\n: 0 1 0 x\nE\n',
    )
    expect(v1.headers.version).toBe('1.1.0')
    expect(v2.headers.version).toBe('2.0.0')
  })

  it('throws when a note line is missing fields or has a bad type token', () => {
    expect(() => parseUltraStar(song(': 0 4\nE\n'))).toThrow(UltraStarParseError)
    expect(() => parseUltraStar(song(': onlytext\nE\n'))).toThrow(UltraStarParseError)
    expect(() => parseUltraStar(song('note 0 4 0 hi\nE\n'))).toThrow(
      /single character/,
    )
    expect(() => parseUltraStar(song('hello world\nE\n'))).toThrow(
      /single character|Unrecognized/,
    )
  })

  it('throws on a negative duration or start beat, and on a non-integer pitch', () => {
    expect(() => parseUltraStar(song(': 0 -4 0 no\nE\n'))).toThrow(/duration/)
    expect(() => parseUltraStar(song(': -1 4 0 no\nE\n'))).toThrow(/start beat/)
    expect(() => parseUltraStar(song(': 0 4 1.5 no\nE\n'))).toThrow(
      /must be: type startBeat|pitch/,
    )
  })

  it('throws on a broken phrase break and on P0', () => {
    expect(() => parseUltraStar(song(': 0 4 0 x\n-\nE\n'))).toThrow(/Phrase break/)
    expect(() => parseUltraStar(song(': 0 4 0 x\n- nope\nE\n'))).toThrow(
      /Phrase break/,
    )
    expect(() => parseUltraStar(song('P0\n: 0 4 0 x\nE\n'))).toThrow(/P0/)
  })

  it('throws when the body has no notes', () => {
    expect(() =>
      parseUltraStar('#TITLE:T\n#ARTIST:A\n#BPM:100\nE\n'),
    ).toThrow(/no notes/)
  })

  it('records a warning for unknown note types, duration 0, missing audio, and odd encodings', () => {
    const parsed = parseUltraStar(
      `#TITLE:T
#ARTIST:A
#BPM:100
#ENCODING:CP1252
X 0 0 0 ?
E
`,
    )
    const messages = parsed.warnings.map((warning) => warning.message)
    expect(parsed.notes[0]?.type).toBe('freestyle')
    expect(messages.some((message) => /Unknown note type "X"/.test(message))).toBe(
      true,
    )
    expect(messages.some((message) => /duration of 0/.test(message))).toBe(true)
    expect(messages.some((message) => /#MP3 or #AUDIO/.test(message))).toBe(true)
    expect(messages.some((message) => /ENCODING/.test(message))).toBe(true)
  })

  it('warns about overlapping notes in the same voice', () => {
    const parsed = parseUltraStar(song(`: 0 8 0 long\n: 4 4 0 overlap\nE\n`))
    expect(
      parsed.warnings.some((warning) => /Overlapping notes in voice 1/.test(warning.message)),
    ).toBe(true)
  })

  it('includes the line number on body parse errors', () => {
    try {
      parseUltraStar(song(`: 0 4 0 ok\nthis is bad\nE\n`))
      throw new Error('expected parse to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(UltraStarParseError)
      expect((error as UltraStarParseError).lineNumber).toBe(5)
    }
  })

  it('treats a lowercase e as the end marker', () => {
    const parsed = parseUltraStar(song(`: 0 1 0 x\ne\n: 8 1 0 no\n`))
    expect(parsed.notes).toHaveLength(1)
  })
})
