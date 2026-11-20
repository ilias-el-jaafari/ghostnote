import { clampOffsetMs } from './offsets.ts'

/**
 * The game clock is `songTime = mediaTime + offset` (see `mediaTimeAt`).
 * If the singer taps at media time `tapMediaMs` to mark the first sung note,
 * the song clock should read `expectedFirstNoteMs`, so:
 *   offset = expectedFirstNoteMs − tapMediaMs
 *
 * The brief wrote this as `tapTime − expectedFirstNoteTime` under a
 * media-minus-song convention; we use the sign that matches the existing clock.
 */
export function offsetFromTap(tapMediaMs: number, expectedFirstNoteMs: number): number {
  if (!Number.isFinite(tapMediaMs) || !Number.isFinite(expectedFirstNoteMs)) return 0
  return clampOffsetMs(expectedFirstNoteMs - tapMediaMs)
}

/** Average several tap offsets, ignoring invalid samples. */
export function averageTapOffset(
  tapMediaMs: readonly number[],
  expectedFirstNoteMs: number,
): number {
  const offsets = tapMediaMs
    .filter((value) => Number.isFinite(value))
    .map((value) => offsetFromTap(value, expectedFirstNoteMs))
  if (offsets.length === 0) return 0
  const sum = offsets.reduce((total, value) => total + value, 0)
  return clampOffsetMs(sum / offsets.length)
}

/** Milliseconds until the chart's first note, using raw media time (offset 0). */
export function countdownToFirstNote(expectedFirstNoteMs: number, mediaMs: number): number {
  return expectedFirstNoteMs - mediaMs
}

export const NUDGE_SMALL_MS = 10
export const NUDGE_LARGE_MS = 50
