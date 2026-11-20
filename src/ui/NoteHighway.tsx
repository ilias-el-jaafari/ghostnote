import { useI18n } from '../i18n/index.ts'
import type { SongTimeline, TimedNote } from '../game/index.ts'

type NoteHighwayProps = {
  timeline: SongTimeline
  timeMs: number
  sungMidi: number | null
}

const LOOKAHEAD_MS = 4000
const LOOKBEHIND_MS = 800
const NOW_RATIO = 0.2

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
  // Choose the octave closest to the centre of the visible range.
  const centre = (minMidi + maxMidi) / 2
  let best = candidate
  for (const option of [candidate - 12, candidate, candidate + 12]) {
    if (Math.abs(option - centre) < Math.abs(best - centre)) best = option
  }
  return best - 60
}

export function NoteHighway({ timeline, timeMs, sungMidi }: NoteHighwayProps) {
  const { t } = useI18n()
  const { min, max } = pitchRange(timeline.notes)
  const span = max - min || 1

  return (
    <div className="highway" role="img" aria-label={t('sing.now')}>
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
        const startX = NOW_RATIO * 100 + ((note.startMs - timeMs) / LOOKAHEAD_MS) * (100 * (1 - NOW_RATIO))
        const width = (note.duration * timeline.beatDurationMs / LOOKAHEAD_MS) * (100 * (1 - NOW_RATIO))
        const left = startX
        // Skip notes well off-screen.
        if (left + width < -5 || left > 110) return null
        const bottom = ((note.pitch - min) / span) * 100
        const active = note.startMs <= timeMs && timeMs < note.endMs
        return (
          <div
            key={`${note.index}-${note.startBeat}`}
            className={`note-bar note-${note.type}${active ? ' is-active' : ''}`}
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 1.2)}%`,
              bottom: `calc(${bottom}% - 8px)`,
            }}
          />
        )
      })}
      {sungMidi !== null ? (
        <div
          className="pitch-marker"
          style={{
            left: `${NOW_RATIO * 100}%`,
            bottom: `calc(${((foldToRange(sungMidi, min, max) - min) / span) * 100}% - 7px)`,
          }}
        />
      ) : null}
    </div>
  )
}

export const HIGHWAY_LOOKAHEAD_MS = LOOKAHEAD_MS
export const HIGHWAY_LOOKBEHIND_MS = LOOKBEHIND_MS
