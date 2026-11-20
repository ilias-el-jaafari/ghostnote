import { describe, expect, it } from 'vitest'
import { parseUltraStar } from '../parser/index.ts'
import { ultraStarPitchToMidi } from '../pitch/index.ts'
import {
  GOLDEN_MULTIPLIER,
  HIT_TOLERANCE_CENTS,
  MAX_LINE_BONUS,
  MAX_NOTE_SCORE,
  MAX_SCORE,
  applyScoreWindow,
  buildScorePlan,
  createScoreState,
  finalizeScore,
  gradeForScore,
  playthrough,
  sampleHitsFragment,
  scoreFactor,
  snapshotScore,
  type SingerSample,
} from './scoring.ts'
import { simulatedSampleAt } from './simulateSinger.ts'
import { buildTimeline } from './timing.ts'

const DEMO = `#TITLE:Midnight Echo
#ARTIST:The Night Owls
#BPM:120
#GAP:0
: 0 4 0 Mid
: 4 4 2 night
: 8 8 4  e
: 16 8 5 cho
- 28
: 32 4 0 Sing
: 36 4 2  with
: 40 4 4  the
* 44 8 7  glow
- 56
: 64 4 0 Rise
: 68 4 5  and
: 72 8 7  shine
- 84
: 88 4 0 Mid
: 92 4 2 night
: 96 8 4  e
* 104 12 0 cho
E
`

const MIXED = `#TITLE:Mix
#ARTIST:T
#BPM:120
: 0 4 0 aa
* 4 4 0 bb
F 8 4 0 cc
R 12 4 5 dd
G 16 4 5 ee
E
`

const silent: SingerSample = { midi: null, presence: false }

describe('score factors', () => {
  it('gives golden and golden-rap notes 2x, freestyle 0, and rap 1x', () => {
    expect(scoreFactor('regular')).toBe(1)
    expect(scoreFactor('golden')).toBe(GOLDEN_MULTIPLIER)
    expect(scoreFactor('rap')).toBe(1)
    expect(scoreFactor('goldenRap')).toBe(GOLDEN_MULTIPLIER)
    expect(scoreFactor('freestyle')).toBe(0)
  })
})

describe('sampleHitsFragment', () => {
  const plan = buildScorePlan(buildTimeline(parseUltraStar(MIXED), { tailMs: 0 }))
  const pitched = plan.fragments.find((fragment) => fragment.type === 'regular')
  const rap = plan.fragments.find((fragment) => fragment.type === 'rap')
  const free = plan.fragments.find((fragment) => fragment.type === 'freestyle')

  it('hits a pitched note within 50 cents, including another octave, and misses beyond that', () => {
    if (!pitched) throw new Error('missing regular fragment')
    const target = ultraStarPitchToMidi(pitched.pitch)
    expect(sampleHitsFragment(pitched, { midi: target, presence: true })).toBe(true)
    expect(sampleHitsFragment(pitched, { midi: target + 0.4, presence: true })).toBe(true)
    expect(sampleHitsFragment(pitched, { midi: target + 12, presence: true })).toBe(true)
    expect(sampleHitsFragment(pitched, { midi: target + 0.6, presence: true })).toBe(false)
    expect(sampleHitsFragment(pitched, silent)).toBe(false)
    expect(HIT_TOLERANCE_CENTS).toBe(50)
  })

  it('scores rap on presence and never scores freestyle', () => {
    if (!rap || !free) throw new Error('missing rap/freestyle fragment')
    expect(sampleHitsFragment(rap, { midi: null, presence: true })).toBe(true)
    expect(sampleHitsFragment(rap, { midi: 72, presence: false })).toBe(false)
    expect(sampleHitsFragment(free, { midi: 60, presence: true })).toBe(false)
  })
})

describe('buildScorePlan — demo song weights', () => {
  const plan = buildScorePlan(buildTimeline(parseUltraStar(DEMO), { tailMs: 0 }))

  it('weights golden beats twice and splits a 1000-point line bonus across four lines', () => {
    // 24 + (12 + 8*2) + 16 + (16 + 12*2) = 24+28+16+40 = 108
    expect(plan.totalWeight).toBe(108)
    expect(plan.scorableLineCount).toBe(4)
    expect(plan.lineBonusShare).toBe(MAX_LINE_BONUS / 4)
    expect(plan.lineWeight).toEqual([24, 28, 16, 40])
    const glowBeats = plan.fragments.filter((fragment) => fragment.type === 'golden')
    expect(glowBeats.every((fragment) => fragment.weight === 2)).toBe(true)
    expect(glowBeats).toHaveLength(8 + 12)
  })
})

describe('playthrough integration with the simulated singer', () => {
  const song = parseUltraStar(DEMO)
  const timeline = buildTimeline(song, { tailMs: 1000, countInMs: 2000 })
  const plan = buildScorePlan(timeline)

  it('awards a perfect 10000 to a singer who always hits the expected pitch', () => {
    const result = playthrough(plan, (time) => simulatedSampleAt(timeline, time), {
      stepMs: 10,
    })
    expect(result.hitWeight).toBe(plan.totalWeight)
    expect(result.accuracy).toBe(1)
    expect(result.noteScore).toBe(MAX_NOTE_SCORE)
    expect(result.lineBonus).toBe(MAX_LINE_BONUS)
    expect(result.total).toBe(MAX_SCORE)
    expect(result.totalRounded).toBe(MAX_SCORE)
    expect(result.noteScoreRounded).toBe(MAX_NOTE_SCORE)
    expect(result.lineBonusRounded).toBe(MAX_LINE_BONUS)
    expect(result.grade).toBe('grade.ultrastar')
    expect(result.lines.every((line) => line.completed && line.bonus === 250)).toBe(true)
  })

  it('awards 0 when the singer is silent', () => {
    const result = playthrough(plan, () => silent, { stepMs: 20 })
    expect(result.total).toBe(0)
    expect(result.totalRounded).toBe(0)
    expect(result.grade).toBe('grade.toneDeaf')
    expect(result.lines.every((line) => line.bonus === 0)).toBe(true)
  })

  it('stays perfect with 30 cents of noise and collapses with 100 cents of noise', () => {
    let i = 0
    const rng = () => {
      i += 1
      return (i % 10) / 10
    }
    const close = playthrough(
      plan,
      (time) => simulatedSampleAt(timeline, time, { noiseCents: 30, rng }),
      { stepMs: 10 },
    )
    expect(close.total).toBe(MAX_SCORE)

    // rng() = 0 always applies -100 cents, which is outside the 50-cent window.
    const far = playthrough(
      plan,
      (time) => simulatedSampleAt(timeline, time, { noiseCents: 100, rng: () => 0 }),
      { stepMs: 10 },
    )
    expect(far.total).toBe(0)
  })

  it('scores rap by presence and ignores freestyle in a mixed chart', () => {
    const mixedTimeline = buildTimeline(parseUltraStar(MIXED), { tailMs: 0 })
    const mixedPlan = buildScorePlan(mixedTimeline)
    // weights: 4 + 8 + 0 + 4 + 8 = 24
    expect(mixedPlan.totalWeight).toBe(24)

    const present = playthrough(mixedPlan, (time) => simulatedSampleAt(mixedTimeline, time), {
      stepMs: 10,
    })
    expect(present.total).toBe(MAX_SCORE)

    const pitchedOnly = playthrough(
      mixedPlan,
      (time) => {
        const expected = simulatedSampleAt(mixedTimeline, time)
        // Keep pitched hits, drop rap presence.
        if (expected.midi !== null) return expected
        return silent
      },
      { stepMs: 10 },
    )
    // Only regular (4) + golden (8) of 24 → 12/24 of 9000 = 4500, plus half? 
    // One line: hitWeight 12 / 24, line bonus 1000 * 0.5 = 500, total 5000
    expect(pitchedOnly.noteScore).toBe(4500)
    expect(pitchedOnly.lineBonus).toBe(500)
    expect(pitchedOnly.total).toBe(5000)
  })
})

describe('live snapshot and grades', () => {
  it('withholds line bonus and unfinalized beats until the line (and beat) has ended', () => {
    const timeline = buildTimeline(parseUltraStar(DEMO), { tailMs: 0 })
    const plan = buildScorePlan(timeline)
    const fair = createScoreState(plan)
    for (let time = 0; time < 2000; time += 10) {
      applyScoreWindow(fair, time, time + 10, simulatedSampleAt(timeline, time))
    }
    const midFirstLine = snapshotScore(fair, 2000)
    expect(midFirstLine.lines[0]?.completed).toBe(false)
    expect(midFirstLine.lineBonus).toBe(0)
    expect(midFirstLine.hitWeight).toBeGreaterThan(0)
    expect(midFirstLine.hitWeight).toBeLessThan(24)
    expect(midFirstLine.noteScore).toBeCloseTo((MAX_NOTE_SCORE * midFirstLine.hitWeight) / 108, 8)

    for (let time = 2000; time < 3000; time += 10) {
      applyScoreWindow(fair, time, time + 10, simulatedSampleAt(timeline, time))
    }
    const afterFirstLine = snapshotScore(fair, 3000)
    expect(afterFirstLine.lines[0]?.completed).toBe(true)
    expect(afterFirstLine.lines[0]?.bonus).toBe(250)
    expect(afterFirstLine.hitWeight).toBe(24)
    expect(afterFirstLine.lineBonus).toBe(250)
  })

  it('maps classic UltraStar-style grade thresholds', () => {
    expect(gradeForScore(0)).toBe('grade.toneDeaf')
    expect(gradeForScore(1999)).toBe('grade.toneDeaf')
    expect(gradeForScore(2000)).toBe('grade.amateur')
    expect(gradeForScore(3000)).toBe('grade.wannabe')
    expect(gradeForScore(4000)).toBe('grade.hopeful')
    expect(gradeForScore(5000)).toBe('grade.risingStar')
    expect(gradeForScore(6000)).toBe('grade.leadingStar')
    expect(gradeForScore(7000)).toBe('grade.shiningStar')
    expect(gradeForScore(8000)).toBe('grade.superstar')
    expect(gradeForScore(8999)).toBe('grade.superstar')
    expect(gradeForScore(9000)).toBe('grade.ultrastar')
    expect(gradeForScore(10_000)).toBe('grade.ultrastar')
  })

  it('keeps rounded components consistent with the rounded total', () => {
    const result = finalizeScore(
      createScoreState(buildScorePlan(buildTimeline(parseUltraStar(DEMO)))),
      0,
    )
    expect(result.totalRounded).toBe(result.noteScoreRounded + result.lineBonusRounded)
  })
})
