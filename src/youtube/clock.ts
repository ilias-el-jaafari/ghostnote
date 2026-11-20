/**
 * Drive the karaoke clock from a YouTube IFrame player.
 *
 * Between official getCurrentTime() polls we interpolate with performance.now().
 * If the poll and the interpolation drift by more than DRIFT_THRESHOLD_MS we
 * snap back to the player. While the player is not in the PLAYING state
 * (paused, buffering, cued, ended, unstarted, ad, or mid-seek) the clock
 * freezes so the highway cannot run ahead of the audio.
 */

export const YT_UNSTARTED = -1
export const YT_ENDED = 0
export const YT_PLAYING = 1
export const YT_PAUSED = 2
export const YT_BUFFERING = 3
export const YT_CUED = 5

export const DRIFT_THRESHOLD_MS = 40

export type YoutubeClockSnapshot = {
  /** Last accepted getCurrentTime(), in milliseconds, without the user offset. */
  mediaMs: number
  /** performance.now() (or a test clock) when mediaMs was accepted. */
  sampledAt: number
  /** Official YT.PlayerState value. */
  state: number
  /** Per-song user offset, added when reading the song clock. */
  offsetMs: number
  /** True while a seek is in flight. */
  seeking: boolean
  /** True when the player is showing an advertisement. */
  ad: boolean
}

export type YoutubePoll = {
  mediaMs: number
  now: number
  state: number
  offsetMs: number
  seeking?: boolean
  ad?: boolean
}

export type MediaClockReading = {
  timeMs: number
  running: boolean
}

export function isClockRunning(
  state: number,
  seeking = false,
  ad = false,
): boolean {
  return state === YT_PLAYING && !seeking && !ad
}

/**
 * Apply a fresh getCurrentTime() / getPlayerState() poll.
 * Small drift is ignored so interpolation stays smooth; large drift (seek,
 * hitch, correction) snaps to the polled media time.
 */
export function applyPlayerPoll(
  previous: YoutubeClockSnapshot | undefined,
  poll: YoutubePoll,
): YoutubeClockSnapshot {
  const seeking = Boolean(poll.seeking)
  const ad = Boolean(poll.ad)
  const running = isClockRunning(poll.state, seeking, ad)
  const wasRunning = previous
    ? isClockRunning(previous.state, previous.seeking, previous.ad)
    : false

  if (previous && running && wasRunning) {
    const predicted = previous.mediaMs + (poll.now - previous.sampledAt)
    if (Math.abs(predicted - poll.mediaMs) <= DRIFT_THRESHOLD_MS) {
      return {
        ...previous,
        state: poll.state,
        offsetMs: poll.offsetMs,
        seeking,
        ad,
      }
    }
  }

  return {
    mediaMs: poll.mediaMs,
    sampledAt: poll.now,
    state: poll.state,
    offsetMs: poll.offsetMs,
    seeking,
    ad,
  }
}

/** Song time in ms (media + offset), plus whether the clock should advance. */
export function mediaTimeAt(
  snapshot: YoutubeClockSnapshot,
  now: number,
): MediaClockReading {
  const running = isClockRunning(snapshot.state, snapshot.seeking, snapshot.ad)
  const raw = running ? snapshot.mediaMs + (now - snapshot.sampledAt) : snapshot.mediaMs
  return { timeMs: raw + snapshot.offsetMs, running }
}

export type YoutubePlayerLike = {
  getCurrentTime: () => number
  getPlayerState: () => number
  getDuration?: () => number
  playVideo?: () => void
  pauseVideo?: () => void
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void
}

/** Read a player (real or mocked) into a poll record. */
export function pollPlayer(
  player: YoutubePlayerLike,
  now: number,
  offsetMs: number,
  flags: { seeking?: boolean; ad?: boolean } = {},
): YoutubePoll {
  const seconds = player.getCurrentTime()
  const mediaMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0
  return {
    mediaMs,
    now,
    state: player.getPlayerState(),
    offsetMs,
    seeking: flags.seeking,
    ad: flags.ad,
  }
}
