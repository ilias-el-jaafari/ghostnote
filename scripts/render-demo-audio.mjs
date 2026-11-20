/**
 * Render original, copyright-free karaoke backing tracks for the bundled demos.
 * Output: 44.1 kHz stereo WAV, then Ogg Vorbis via ffmpeg.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/songs')
const SR = 44100

function parseChart(text) {
  const headers = {}
  const notes = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line === 'E') continue
    if (line.startsWith('#')) {
      const colon = line.indexOf(':')
      if (colon > 0) headers[line.slice(1, colon).toUpperCase()] = line.slice(colon + 1).trim()
      continue
    }
    if (line.startsWith('-')) continue
    const match = line.match(/^([:*FRG])\s+(\d+)\s+(\d+)\s+(-?\d+)\s*(.*)$/)
    if (match) {
      notes.push({
        type: match[1],
        start: Number(match[2]),
        duration: Number(match[3]),
        pitch: Number(match[4]),
      })
    }
  }
  const bpm = Number(String(headers.BPM ?? '120').replace(',', '.'))
  const gap = Number(String(headers.GAP ?? '0').replace(',', '.'))
  const beatMs = 60_000 / (bpm * 4) // unversioned / v1
  return {
    title: headers.TITLE,
    bpm,
    gap,
    beatMs,
    notes,
    audio: headers.MP3 || headers.AUDIO,
  }
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12)
}

function pitchToHz(pitch) {
  return midiToHz(60 + pitch)
}

function lastNoteEndMs(song) {
  let end = 0
  for (const note of song.notes) {
    end = Math.max(end, song.gap + (note.start + note.duration) * song.beatMs)
  }
  return end
}

function writeSample(left, right, i, l, r) {
  if (i < 0 || i >= left.length) return
  left[i] += l
  right[i] += r
}

function envADSR(t, dur, a = 0.01, d = 0.08, s = 0.7, r = 0.08) {
  if (t < 0 || t > dur) return 0
  if (t < a) return t / a
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d)
  if (t > dur - r && dur > r) return s * (1 - (t - (dur - r)) / r)
  return s
}

function renderSong(song, style) {
  const endMs = lastNoteEndMs(song) + 1200
  const n = Math.ceil((endMs / 1000) * SR) + SR
  const left = new Float32Array(n)
  const right = new Float32Array(n)

  const beatSec = song.beatMs / 1000
  const barSec = beatSec * 16 // 4 beats of 4 sub-beats
  const durationSec = n / SR

  // Kick, snare, hat
  for (let t = 0; t < durationSec; t += beatSec * 4) {
    const kickAt = Math.floor(t * SR)
    for (let i = 0; i < SR * 0.18; i++) {
      const time = i / SR
      const env = Math.exp(-time * 18)
      const freq = 80 + style.kickHz * Math.exp(-time * 20)
      const sample = Math.sin(2 * Math.PI * freq * time) * env * 0.55
      writeSample(left, right, kickAt + i, sample, sample)
    }
    // offbeat hat
    const hatAt = Math.floor((t + beatSec * 2) * SR)
    for (let i = 0; i < SR * 0.04; i++) {
      const env = Math.exp(-i / SR * 60)
      const noise = (Math.random() * 2 - 1) * env * 0.09
      writeSample(left, right, hatAt + i, noise, noise * 0.8)
    }
    // snare on beat 3 of every other measure-ish (every 8 beats)
    const beatsFromStart = Math.round(t / beatSec)
    if (beatsFromStart % 8 === 4) {
      const snareAt = Math.floor(t * SR)
      for (let i = 0; i < SR * 0.16; i++) {
        const time = i / SR
        const env = Math.exp(-time * 14)
        const tone = Math.sin(2 * Math.PI * 180 * time) * env * 0.15
        const noise = (Math.random() * 2 - 1) * env * 0.22
        const sample = tone + noise
        writeSample(left, right, snareAt + i, sample * 0.9, sample)
      }
    }
  }

  // Soft open hats every 2 beats
  for (let t = beatSec; t < durationSec; t += beatSec * 2) {
    const at = Math.floor(t * SR)
    for (let i = 0; i < SR * 0.06; i++) {
      const env = Math.exp(-i / SR * 40)
      const noise = (Math.random() * 2 - 1) * env * 0.05
      writeSample(left, right, at + i, noise * 0.7, noise)
    }
  }

  // Bass + pad following each melody note
  for (const note of song.notes) {
    const startSec = (song.gap + note.start * song.beatMs) / 1000
    const dur = (note.duration * song.beatMs) / 1000
    const hz = pitchToHz(note.pitch)
    const bassHz = hz / 2
    const start = Math.floor(startSec * SR)
    const len = Math.floor(dur * SR)
    for (let i = 0; i < len; i++) {
      const time = i / SR
      const env = envADSR(time, dur, 0.02, 0.1, 0.65, 0.12)
      const bass =
        Math.sin(2 * Math.PI * bassHz * time) * 0.28 +
        Math.sin(2 * Math.PI * (bassHz * 2) * time) * 0.05
      const pad =
        Math.sin(2 * Math.PI * hz * 0.5 * time + 0.2) * 0.08 +
        Math.sin(2 * Math.PI * hz * (5 / 4) * time) * 0.06 +
        Math.sin(2 * Math.PI * hz * 1.5 * time) * 0.04
      const wobble = 1 + 0.03 * Math.sin(2 * Math.PI * 5 * time)
      const l = (bass * wobble + pad * 0.7) * env
      const r = (bass * wobble * 0.85 + pad) * env
      writeSample(left, right, start + i, l, r)
    }

    // Soft lead (karaoke-style, quieter than a singer)
    const leadGain = note.type === '*' ? 0.16 : 0.11
    for (let i = 0; i < len; i++) {
      const time = i / SR
      const env = envADSR(time, dur, 0.015, 0.08, 0.55, 0.1)
      const vib = hz * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * time))
      const lead =
        Math.sin(2 * Math.PI * vib * time) * 0.7 +
        Math.sin(2 * Math.PI * vib * 2 * time) * 0.15
      const sample = lead * env * leadGain * style.lead
      writeSample(left, right, start + i, sample * 0.9, sample)
    }
  }

  // Ambient pad bed in the song key (C / moving)
  const root = style.padHz
  for (let i = 0; i < n; i++) {
    const time = i / SR
    const env = Math.min(1, time / 0.8) * Math.min(1, (durationSec - time) / 1.2)
    const a = Math.sin(2 * Math.PI * root * time) * 0.04
    const b = Math.sin(2 * Math.PI * root * 1.5 * time + 0.4) * 0.03
    const c = Math.sin(2 * Math.PI * root * 2 * time + 1.1) * 0.02
    const chorus = Math.sin(2 * Math.PI * (root * 1.002) * time) * 0.02
    writeSample(left, right, i, (a + b + chorus) * env, (a + c + chorus) * env)
  }

  // Gentle swell at golden notes
  for (const note of song.notes) {
    if (note.type !== '*') continue
    const startSec = (song.gap + note.start * song.beatMs) / 1000
    const dur = (note.duration * song.beatMs) / 1000
    const start = Math.floor(startSec * SR)
    const len = Math.floor(dur * SR)
    const hz = pitchToHz(note.pitch) * 2
    for (let i = 0; i < len; i++) {
      const time = i / SR
      const env = Math.sin(Math.PI * (i / len)) * 0.08
      const bell = Math.sin(2 * Math.PI * hz * time) * Math.exp(-time * 2)
      writeSample(left, right, start + i, bell * env, bell * env * 0.85)
    }
  }

  normalize(left, right, 0.89)
  // very light stereo delay
  const delay = Math.floor(0.09 * SR)
  const echo = new Float32Array(n)
  for (let i = 0; i < n - delay; i++) echo[i + delay] += right[i] * 0.12
  for (let i = 0; i < n; i++) right[i] += echo[i]

  normalize(left, right, 0.92)
  return { left, right, sampleRate: SR }
}

function normalize(left, right, peak = 0.95) {
  let max = 0
  for (let i = 0; i < left.length; i++) {
    max = Math.max(max, Math.abs(left[i]), Math.abs(right[i]))
  }
  if (max < 1e-6) return
  const g = peak / max
  for (let i = 0; i < left.length; i++) {
    left[i] *= g
    right[i] *= g
  }
}

function encodeWav(left, right, sampleRate) {
  const dataSize = left.length * 2 * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2 * 2, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  let o = 44
  for (let i = 0; i < left.length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]))
    const r = Math.max(-1, Math.min(1, right[i]))
    buffer.writeInt16LE((l * 32767) | 0, o)
    buffer.writeInt16LE((r * 32767) | 0, o + 2)
    o += 4
  }
  return buffer
}

const styles = {
  'midnight-echo.txt': { kickHz: 70, padHz: 130.81, lead: 1 },
  'aqua-parade.txt': { kickHz: 60, padHz: 146.83, lead: 0.95 },
  'sky-capsule.txt': { kickHz: 85, padHz: 164.81, lead: 1.05 },
}

const charts = ['midnight-echo.txt', 'aqua-parade.txt', 'sky-capsule.txt']
mkdirSync(outDir, { recursive: true })

for (const name of charts) {
  const text = readFileSync(resolve(root, 'src/songs', name), 'utf8')
  const song = parseChart(text)
  const rendered = renderSong(song, styles[name])
  const wavPath = resolve(outDir, name.replace('.txt', '.wav'))
  const oggPath = resolve(outDir, song.audio)
  writeFileSync(wavPath, encodeWav(rendered.left, rendered.right, rendered.sampleRate))
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '5', oggPath],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${name}`)
  }
  unlinkSync(wavPath)
  console.log('rendered', oggPath, `(${(rendered.left.length / SR).toFixed(1)}s)`)
}
