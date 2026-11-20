/**
 * Temporal smoothing for sung pitch: a short median filter plus hysteresis
 * that rejects sudden octave / harmonic jumps unless they hold for several
 * frames (a real register change, not a momentary overtone lock).
 */

const DEFAULT_WINDOW = 5
const DEFAULT_CONFIRM_FRAMES = 3
const DEFAULT_SILENCE_RESET = 6
/** Accept a ratio as 2× / 3× / 4× (or the inverse) within this many cents. */
const HARMONIC_CENTS = 80

export type OctaveHysteresisOptions = {
  /** Median-filter length in frames. */
  window?: number
  /** Consecutive octave-related frames required before accepting the jump. */
  confirmFrames?: number
  /** Drop the locked pitch after this many silent frames. */
  silenceReset?: number
}

export function centsBetween(aHz: number, bHz: number): number {
  if (!(aHz > 0) || !(bHz > 0)) return Number.POSITIVE_INFINITY
  return 1200 * Math.log2(aHz / bHz)
}

export function isClosePitch(aHz: number, bHz: number, cents = HARMONIC_CENTS): boolean {
  return Math.abs(centsBetween(aHz, bHz)) < cents
}

export function isOctaveOrHarmonicJump(aHz: number, bHz: number): boolean {
  if (!(aHz > 0) || !(bHz > 0)) return false
  const ratio = aHz / bHz
  const factors = [2, 0.5, 3, 1 / 3, 4, 0.25]
  return factors.some((factor) => {
    const cents = 1200 * Math.log2(ratio / factor)
    return Math.abs(cents) < HARMONIC_CENTS
  })
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid]
  if (upper === undefined) return Number.NaN
  if (sorted.length % 2 === 1) return upper
  const lower = sorted[mid - 1]
  if (lower === undefined) return upper
  return (lower + upper) / 2
}

export class OctaveHysteresis {
  private readonly window: number
  private readonly confirmFrames: number
  private readonly silenceReset: number
  private history: number[] = []
  private locked: number | undefined
  private pending: number | undefined
  private pendingCount = 0
  private silentFrames = 0

  constructor(options: OctaveHysteresisOptions = {}) {
    this.window = Math.max(1, options.window ?? DEFAULT_WINDOW)
    this.confirmFrames = Math.max(1, options.confirmFrames ?? DEFAULT_CONFIRM_FRAMES)
    this.silenceReset = Math.max(1, options.silenceReset ?? DEFAULT_SILENCE_RESET)
  }

  reset(): void {
    this.history = []
    this.locked = undefined
    this.pending = undefined
    this.pendingCount = 0
    this.silentFrames = 0
  }

  get lockedFrequency(): number | undefined {
    return this.locked
  }

  push(frequency: number | null): number | null {
    if (frequency == null || !(frequency > 0) || !Number.isFinite(frequency)) {
      this.silentFrames += 1
      this.pending = undefined
      this.pendingCount = 0
      if (this.silentFrames >= this.silenceReset) {
        this.reset()
        return null
      }
      return this.locked ?? null
    }

    this.silentFrames = 0

    if (this.locked === undefined) {
      this.history.push(frequency)
      if (this.history.length > this.window) this.history.shift()
      const median = medianOf(this.history)
      this.locked = Number.isFinite(median) ? median : frequency
      return this.locked
    }

    // Compare the raw frame to the lock so a single overtone spike cannot
    // hide inside the median window, and a sustained jump can be counted
    // frame-by-frame without waiting for the median to catch up.
    if (isOctaveOrHarmonicJump(this.locked, frequency)) {
      if (this.pending !== undefined && isClosePitch(this.pending, frequency)) {
        this.pending = frequency
        this.pendingCount += 1
      } else {
        this.pending = frequency
        this.pendingCount = 1
      }
      if (this.pendingCount >= this.confirmFrames) {
        this.locked = frequency
        this.history = [frequency]
        this.pending = undefined
        this.pendingCount = 0
      }
      return this.locked
    }

    this.pending = undefined
    this.pendingCount = 0
    if (Math.abs(centsBetween(frequency, this.locked)) > 60) {
      // A real melody leap (fifth, step, etc.) — follow immediately.
      this.history = [frequency]
      this.locked = frequency
      return this.locked
    }

    this.history.push(frequency)
    if (this.history.length > this.window) this.history.shift()
    const median = medianOf(this.history)
    this.locked = Number.isFinite(median) ? median : frequency
    return this.locked
  }
}
