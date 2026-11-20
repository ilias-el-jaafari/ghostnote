import {
  comparePitchOctaveTolerant,
  ultraStarPitchToMidi,
} from '../pitch/index.ts'
import type { NoteType } from '../parser/index.ts'
import type { SongTimeline, TimedNote } from './timing.ts'

export const MAX_NOTE_SCORE = 9000
export const MAX_LINE_BONUS = 1000
export const MAX_SCORE = 10_000
export const HIT_TOLERANCE_CENTS = 50
export const GOLDEN_MULTIPLIER = 2
/** A beat (fragment) counts as a hit if at least this fraction of it was sung correctly. */
export const HIT_COVERAGE = 0.5

export const SCORE_FACTOR: Record<NoteType, number> = {
  regular: 1,
  golden: GOLDEN_MULTIPLIER,
  rap: 1,
  goldenRap: GOLDEN_MULTIPLIER,
  freestyle: 0,
}

export type SingerSample = {
  /** Sung MIDI note, or null if no pitch was detected. */
  midi: number | null
  /** True when there is voice in the signal (used for rap notes). */
  presence: boolean
}

export type ScoreFragment = {
  index: number
  noteIndex: number
  lineIndex: number
  startMs: number
  endMs: number
  pitch: number
  type: NoteType
  weight: number
  requiresPitch: boolean
}

export type ScorePlan = {
  timeline: SongTimeline
  fragments: ScoreFragment[]
  totalWeight: number
  /** Lines that have at least one scorable (non-freestyle) fragment. */
  scorableLineCount: number
  lineWeight: number[]
  lineBonusShare: number
}

export type ScoreState = {
  plan: ScorePlan
  hitMs: Float64Array
  lastTimeMs: number
}

export type LineResult = {
  lineIndex: number
  hitWeight: number
  weight: number
  bonus: number
  completed: boolean
}

export type ScoreSnapshot = {
  noteScore: number
  lineBonus: number
  total: number
  hitWeight: number
  totalWeight: number
  /** Hit weight / total weight, 0 when the song has no scorable notes. */
  accuracy: number
  finalizedFragments: number
  totalFragments: number
  lines: LineResult[]
}

export type GradeKey =
  | 'grade.toneDeaf'
  | 'grade.amateur'
  | 'grade.wannabe'
  | 'grade.hopeful'
  | 'grade.risingStar'
  | 'grade.leadingStar'
  | 'grade.shiningStar'
  | 'grade.superstar'
  | 'grade.ultrastar'

export type RoundResult = ScoreSnapshot & {
  totalRounded: number
  noteScoreRounded: number
  lineBonusRounded: number
  grade: GradeKey
}

export function scoreFactor(type: NoteType): number {
  return SCORE_FACTOR[type]
}

export function isScorable(type: NoteType): boolean {
  return SCORE_FACTOR[type] > 0
}

export function sampleHitsFragment(
  fragment: ScoreFragment,
  sample: SingerSample,
  toleranceCents = HIT_TOLERANCE_CENTS,
): boolean {
  if (fragment.weight <= 0) return false
  if (fragment.requiresPitch) {
    if (sample.midi === null) return false
    return comparePitchOctaveTolerant(
      sample.midi,
      ultraStarPitchToMidi(fragment.pitch),
      toleranceCents,
    ).match
  }
  return sample.presence
}

export function buildScorePlan(timeline: SongTimeline): ScorePlan {
  const fragments: ScoreFragment[] = []
  const lineWeight: number[] = timeline.lines.map(() => 0)

  for (const note of timeline.notes) {
    const factor = scoreFactor(note.type)
    const requiresPitch = note.type === 'regular' || note.type === 'golden'
    if (note.duration <= 0) continue
    for (let offset = 0; offset < note.duration; offset += 1) {
      const beat = note.startBeat + offset
      const startMs = timeline.beatToMs(beat)
      const endMs = timeline.beatToMs(beat + 1)
      const fragment: ScoreFragment = {
        index: fragments.length,
        noteIndex: note.index,
        lineIndex: note.lineIndex,
        startMs,
        endMs,
        pitch: note.pitch,
        type: note.type,
        weight: factor,
        requiresPitch,
      }
      fragments.push(fragment)
      const current = lineWeight[note.lineIndex] ?? 0
      lineWeight[note.lineIndex] = current + factor
    }
  }

  const totalWeight = fragments.reduce((sum, fragment) => sum + fragment.weight, 0)
  const scorableLineCount = lineWeight.filter((weight) => weight > 0).length
  const lineBonusShare =
    scorableLineCount > 0 ? MAX_LINE_BONUS / scorableLineCount : 0

  return {
    timeline,
    fragments,
    totalWeight,
    scorableLineCount,
    lineWeight,
    lineBonusShare,
  }
}

export function createScoreState(plan: ScorePlan): ScoreState {
  return {
    plan,
    hitMs: new Float64Array(plan.fragments.length),
    lastTimeMs: Number.NEGATIVE_INFINITY,
  }
}

/**
 * Attribute a time window during which `sample` was constant.
 * `fromMs` is inclusive, `toMs` is exclusive, in song time.
 */
export function applyScoreWindow(
  state: ScoreState,
  fromMs: number,
  toMs: number,
  sample: SingerSample,
  toleranceCents = HIT_TOLERANCE_CENTS,
): void {
  if (!(toMs > fromMs)) return
  const { fragments } = state.plan
  for (let i = 0; i < fragments.length; i += 1) {
    const fragment = fragments[i]
    if (!fragment || fragment.weight <= 0) continue
    const overlap = Math.min(fragment.endMs, toMs) - Math.max(fragment.startMs, fromMs)
    if (overlap <= 0) continue
    if (sampleHitsFragment(fragment, sample, toleranceCents)) {
      state.hitMs[i] = (state.hitMs[i] ?? 0) + overlap
    }
  }
  state.lastTimeMs = toMs
}

function fragmentIsHit(state: ScoreState, fragment: ScoreFragment): boolean {
  const duration = fragment.endMs - fragment.startMs
  if (duration <= 0 || fragment.weight <= 0) return false
  return (state.hitMs[fragment.index] ?? 0) / duration >= HIT_COVERAGE
}

export function snapshotScore(state: ScoreState, timeMs: number): ScoreSnapshot {
  const { plan } = state
  const lineHit = plan.lineWeight.map(() => 0)
  let hitWeight = 0
  let finalizedFragments = 0

  for (const fragment of plan.fragments) {
    if (fragment.endMs > timeMs) continue
    finalizedFragments += 1
    if (fragment.weight <= 0) continue
    if (fragmentIsHit(state, fragment)) {
      hitWeight += fragment.weight
      lineHit[fragment.lineIndex] = (lineHit[fragment.lineIndex] ?? 0) + fragment.weight
    }
  }

  const lines: LineResult[] = plan.timeline.lines.map((line) => {
    const weight = plan.lineWeight[line.index] ?? 0
    const hit = lineHit[line.index] ?? 0
    const completed = line.endMs <= timeMs
    const bonus =
      completed && weight > 0 ? plan.lineBonusShare * (hit / weight) : 0
    return {
      lineIndex: line.index,
      hitWeight: hit,
      weight,
      bonus,
      completed,
    }
  })

  const noteScore = plan.totalWeight > 0 ? (MAX_NOTE_SCORE * hitWeight) / plan.totalWeight : 0
  const lineBonus = lines.reduce((sum, line) => sum + line.bonus, 0)
  const accuracy = plan.totalWeight > 0 ? hitWeight / plan.totalWeight : 0

  return {
    noteScore,
    lineBonus,
    total: noteScore + lineBonus,
    hitWeight,
    totalWeight: plan.totalWeight,
    accuracy,
    finalizedFragments,
    totalFragments: plan.fragments.length,
    lines,
  }
}

export function gradeForScore(total: number): GradeKey {
  if (total >= 9000) return 'grade.ultrastar'
  if (total >= 8000) return 'grade.superstar'
  if (total >= 7000) return 'grade.shiningStar'
  if (total >= 6000) return 'grade.leadingStar'
  if (total >= 5000) return 'grade.risingStar'
  if (total >= 4000) return 'grade.hopeful'
  if (total >= 3000) return 'grade.wannabe'
  if (total >= 2000) return 'grade.amateur'
  return 'grade.toneDeaf'
}

/**
 * Round the three published components so they are integers and
 * the rounded total equals rounded notes + rounded line bonus.
 */
export function finalizeScore(state: ScoreState, timeMs: number): RoundResult {
  const snapshot = snapshotScore(state, timeMs)
  const totalRounded = Math.round(snapshot.total)
  let noteScoreRounded = Math.round(snapshot.noteScore)
  let lineBonusRounded = Math.round(snapshot.lineBonus)
  const drift = totalRounded - (noteScoreRounded + lineBonusRounded)
  if (drift !== 0) {
    if (noteScoreRounded > 0 || lineBonusRounded === 0) noteScoreRounded += drift
    else lineBonusRounded += drift
  }
  return {
    ...snapshot,
    totalRounded,
    noteScoreRounded,
    lineBonusRounded,
    grade: gradeForScore(totalRounded),
  }
}

export function playthrough(
  plan: ScorePlan,
  sampleAt: (timeMs: number) => SingerSample,
  options: { stepMs?: number; fromMs?: number; toMs?: number } = {},
): RoundResult {
  const stepMs = options.stepMs ?? 10
  const fromMs = options.fromMs ?? plan.timeline.firstNoteMs
  const toMs = options.toMs ?? plan.timeline.endMs
  const state = createScoreState(plan)
  for (let time = fromMs; time < toMs; time += stepMs) {
    const end = Math.min(time + stepMs, toMs)
    applyScoreWindow(state, time, end, sampleAt(time))
  }
  return finalizeScore(state, toMs)
}

export type HighwayNote = TimedNote & { hits: boolean[] }

export function currentSyllableIndex(timeline: SongTimeline, timeMs: number): {
  lineIndex: number
  noteIndexInLine: number
} | undefined {
  const line = timeline.lines.find(
    (item) => item.startMs <= timeMs && timeMs < item.endMs,
  ) ?? timeline.lines.reduce<{ best?: typeof timeline.lines[number] }>((acc, item) => {
    if (item.startMs <= timeMs) acc.best = item
    return acc
  }, {}).best

  if (!line) return undefined
  const noteIndexInLine = line.notes.findIndex((_, index) => {
    const note = line.notes[index]
    if (!note) return false
    const start = timeline.beatToMs(note.startBeat)
    const end = timeline.beatToMs(note.startBeat + note.duration)
    return start <= timeMs && timeMs < end
  })
  return {
    lineIndex: line.index,
    noteIndexInLine: noteIndexInLine >= 0 ? noteIndexInLine : -1,
  }
}
