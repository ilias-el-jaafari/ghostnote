import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/index.ts'
import type { SongTimeline, TimedNote } from '../game/index.ts'
import { drawPersistentFlare, ParticleEngine, NOW_LINE_RATIO } from '../visual/particles.ts'
import { noteTint, THEMES, type ThemeId } from '../visual/themes.ts'

type NoteHighwayProps = {
  timeline: SongTimeline
  timeMs: number
  sungMidi: number | null
  hitting?: boolean
  particles?: boolean
  flares?: boolean
  maxParticles?: number
  themeId?: ThemeId
}

const LOOKAHEAD_MS = 4000
const LOOKBEHIND_MS = 800
const NOW_RATIO = NOW_LINE_RATIO

function pitchRange(notes: TimedNote[]): { min: number; max: number } {
  if (notes.length === 0) return { min: 0, max: 12 }
  let min = Infinity
  let max = -Infinity
  for (const note of notes) {
    min = Math.min(min, note.pitch)
    max = Math.max(max, note.pitch)
  }
  min -= 2
  max += 2
  if (max - min < 8) {
    const mid = (min + max) / 2
    min = mid - 4
    max = mid + 4
  }
  return { min, max }
}

/** Fold a MIDI value into an UltraStar-pitch range, preserving pitch class. */
function foldToRange(midi: number, minPitch: number, maxPitch: number): number {
  const minMidi = 60 + minPitch
  const maxMidi = 60 + maxPitch
  let candidate = midi
  while (candidate < minMidi - 6) candidate += 12
  while (candidate > maxMidi + 6) candidate -= 12
  const centre = (minMidi + maxMidi) / 2
  let best = candidate
  for (const option of [candidate - 12, candidate, candidate + 12]) {
    if (Math.abs(option - centre) < Math.abs(best - centre)) best = option
  }
  return best - 60
}

function noteY(pitch: number, min: number, span: number, height: number): number {
  const bottom = ((pitch - min) / span) * height
  return height - bottom
}

export function NoteHighway({
  timeline,
  timeMs,
  sungMidi,
  hitting = false,
  particles = false,
  flares = false,
  maxParticles = 0,
  themeId = 'aqua',
}: NoteHighwayProps) {
  const { t } = useI18n()
  const { min, max } = pitchRange(timeline.notes)
  const span = max - min || 1
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticleEngine | undefined>(undefined)
  const lastRef = useRef(0)
  const laneStyle = THEMES[themeId].laneStyle
  const frameRef = useRef({
    timeMs,
    hitting,
    particles,
    flares,
    maxParticles,
    min,
    span,
    timeline,
    laneStyle,
  })

  useEffect(() => {
    frameRef.current = {
      timeMs,
      hitting,
      particles,
      flares,
      maxParticles,
      min,
      span,
      timeline,
      laneStyle,
    }
  }, [timeMs, hitting, particles, flares, maxParticles, min, span, timeline, laneStyle])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    engineRef.current = new ParticleEngine({ maxParticles })
    let frame = 0
    const loop = (now: number) => {
      const current = frameRef.current
      const engine = engineRef.current
      if (!engine) return
      if (engine.maxParticles !== current.maxParticles) {
        engineRef.current = new ParticleEngine({ maxParticles: current.maxParticles })
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const dt = Math.min(0.05, (now - lastRef.current) / 1000)
      lastRef.current = now
      ctx.clearRect(0, 0, width, height)

      const nowX = NOW_RATIO * width
      if (current.laneStyle === 'perspective') {
        drawPerspectiveLanes(ctx, width, height, nowX)
      }
      const active = current.timeline.notes.filter(
        (note) => note.startMs <= current.timeMs && current.timeMs < note.endMs,
      )
      const golden = active.some((note) => note.type === 'golden' || note.type === 'goldenRap')
      const target = active[0]
      const y = target
        ? noteY(target.pitch, current.min, current.span, height)
        : height * 0.5

      if (current.flares && (golden || current.hitting)) {
        drawPersistentFlare(ctx, nowX, y, golden ? 1 : 0.55, golden)
      } else if (current.flares) {
        drawPersistentFlare(ctx, nowX, height * 0.5, 0.28, false)
      }

      if (engine && current.particles && current.maxParticles > 0) {
        if (current.hitting || golden) {
          engine.spawnStream(nowX, y, golden, dt)
        }
        engine.tick(dt)
        engine.draw(ctx)
      }

      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [maxParticles])

  return (
    <div
      className={laneStyle === 'perspective' ? 'highway highway-perspective' : 'highway'}
      role="img"
      aria-label={t('sing.now')}
    >
      <div className="highway-lanes" aria-hidden="true">
        {Array.from({ length: Math.round(span) + 1 }, (_, index) => (
          <span
            key={index}
            className="highway-lane"
            style={{ bottom: `${(index / span) * 100}%` }}
          />
        ))}
      </div>
      <div className="highway-now" />
      {timeline.notes.map((note) => {
        const startX =
          NOW_RATIO * 100 + ((note.startMs - timeMs) / LOOKAHEAD_MS) * (100 * (1 - NOW_RATIO))
        const width =
          ((note.duration * timeline.beatDurationMs) / LOOKAHEAD_MS) * (100 * (1 - NOW_RATIO))
        if (startX + width < -5 || startX > 110) return null
        const bottom = ((note.pitch - min) / span) * 100
        const active = note.startMs <= timeMs && timeMs < note.endMs
        const tint = noteTint(note.pitch, note.type)
        return (
          <div
            key={`${note.index}-${note.startBeat}`}
            className={`note-bar note-${note.type}${active ? ' is-active' : ''}`}
            style={{
              left: `${startX}%`,
              width: `${Math.max(width, 1.6)}%`,
              bottom: `calc(${bottom}% - 14px)`,
              ['--note-tint' as string]: tint,
            }}
          />
        )
      })}
      {sungMidi !== null ? (
        <div
          className="pitch-marker"
          style={{
            left: `${NOW_RATIO * 100}%`,
            bottom: `calc(${((foldToRange(sungMidi, min, max) - min) / span) * 100}% - 8px)`,
          }}
        />
      ) : null}
      <canvas ref={canvasRef} className="highway-fx" aria-hidden="true" />
    </div>
  )
}


const LANE_NEON = ['#1ea7ff', '#ff3de8', '#ffe14a', '#3dff5a']

/** Neon perspective floor for Galaxy / Laser — time still runs left to right. */
function drawPerspectiveLanes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nowX: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const vanishX = width * 0.96
  const vanishY = height * 0.52
  const lanes = 5
  for (let i = 0; i < lanes; i++) {
    const y = (height * i) / (lanes - 1)
    ctx.strokeStyle = LANE_NEON[i % LANE_NEON.length] ?? '#1ea7ff'
    ctx.globalAlpha = 0.28
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(vanishX, vanishY)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(180, 255, 255, 0.35)'
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.4
  ctx.beginPath()
  ctx.moveTo(nowX, 0)
  ctx.lineTo(nowX, height)
  ctx.stroke()
  for (let i = 1; i <= 8; i++) {
    const t = i / 8
    const x = nowX + (vanishX - nowX) * t
    const spread = (1 - t * 0.72) * height * 0.48
    ctx.globalAlpha = 0.16 * (1 - t)
    ctx.beginPath()
    ctx.moveTo(x, vanishY - spread)
    ctx.lineTo(x, vanishY + spread)
    ctx.stroke()
  }
  ctx.restore()
}

export const HIGHWAY_LOOKAHEAD_MS = LOOKAHEAD_MS
export const HIGHWAY_LOOKBEHIND_MS = LOOKBEHIND_MS
