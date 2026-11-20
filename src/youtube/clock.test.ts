import { describe, expect, it } from 'vitest'
import {
  applyPlayerPoll,
  DRIFT_THRESHOLD_MS,
  mediaTimeAt,
  pollPlayer,
  YT_BUFFERING,
  YT_PAUSED,
  YT_PLAYING,
  type YoutubePlayerLike,
} from './clock.ts'

function playingAt(mediaMs: number, now: number, offsetMs = 0) {
  return applyPlayerPoll(undefined, {
    mediaMs,
    now,
    state: YT_PLAYING,
    offsetMs,
  })
}

describe('youtube clock — interpolation and drift', () => {
  it('interpolates 1:1 with the wall clock between polls while playing', () => {
    const snap = playingAt(1000, 5000)
    const reading = mediaTimeAt(snap, 5080)
    expect(reading.running).toBe(true)
    expect(reading.timeMs).toBe(1080)
  })

  it('adds the per-song offset to the song time', () => {
    const snap = playingAt(2000, 0, -150)
    expect(mediaTimeAt(snap, 100).timeMs).toBe(1950)
  })

  it('does not resync when the poll is within the drift threshold', () => {
    const first = playingAt(0, 0)
    const drifted = applyPlayerPoll(first, {
      mediaMs: 200 - (DRIFT_THRESHOLD_MS - 5),
      now: 200,
      state: YT_PLAYING,
      offsetMs: 0,
    })
    // Predicted time is 200ms; the poll is only 35ms late, so keep interpolating
    // from the original sample instead of jumping back.
    expect(mediaTimeAt(drifted, 200).timeMs).toBe(200)
    expect(drifted.sampledAt).toBe(0)
  })

  it('snaps to the player when drift is above the threshold', () => {
    const first = playingAt(0, 0)
    const snapped = applyPlayerPoll(first, {
      mediaMs: 500,
      now: 200,
      state: YT_PLAYING,
      offsetMs: 0,
    })
    expect(mediaTimeAt(snapped, 200).timeMs).toBe(500)
    expect(snapped.sampledAt).toBe(200)
    expect(snapped.mediaMs).toBe(500)
  })
})

describe('youtube clock — buffering, pause, seek, offset', () => {
  it('freezes while buffering so the highway cannot run ahead', () => {
    const playing = playingAt(3000, 10_000)
    const buffering = applyPlayerPoll(playing, {
      mediaMs: 3050,
      now: 10_080,
      state: YT_BUFFERING,
      offsetMs: 0,
    })
    expect(mediaTimeAt(buffering, 10_080).running).toBe(false)
    expect(mediaTimeAt(buffering, 10_080).timeMs).toBe(3050)
    expect(mediaTimeAt(buffering, 10_500).timeMs).toBe(3050)
  })

  it('freezes while paused', () => {
    const playing = playingAt(1500, 0)
    const paused = applyPlayerPoll(playing, {
      mediaMs: 1600,
      now: 200,
      state: YT_PAUSED,
      offsetMs: 0,
    })
    expect(mediaTimeAt(paused, 800).running).toBe(false)
    expect(mediaTimeAt(paused, 800).timeMs).toBe(1600)
  })

  it('freezes during a seek and snaps to the new position', () => {
    const playing = playingAt(1000, 0)
    const seeking = applyPlayerPoll(playing, {
      mediaMs: 8000,
      now: 50,
      state: YT_PAUSED,
      offsetMs: 0,
      seeking: true,
    })
    expect(mediaTimeAt(seeking, 80).running).toBe(false)
    expect(mediaTimeAt(seeking, 80).timeMs).toBe(8000)

    const settled = applyPlayerPoll(seeking, {
      mediaMs: 8000,
      now: 120,
      state: YT_PLAYING,
      offsetMs: 0,
    })
    expect(mediaTimeAt(settled, 220).timeMs).toBe(8100)
    expect(mediaTimeAt(settled, 220).running).toBe(true)
  })

  it('freezes during an advertisement', () => {
    const playing = playingAt(400, 0)
    const ad = applyPlayerPoll(playing, {
      mediaMs: 400,
      now: 16,
      state: YT_PLAYING,
      offsetMs: 0,
      ad: true,
    })
    expect(mediaTimeAt(ad, 500).running).toBe(false)
    expect(mediaTimeAt(ad, 500).timeMs).toBe(400)
  })

  it('applies an updated offset without resetting the baseline', () => {
    const first = playingAt(1000, 0, 0)
    const withOffset = applyPlayerPoll(first, {
      mediaMs: 1020,
      now: 20,
      state: YT_PLAYING,
      offsetMs: 250,
    })
    // Drift is 0, so we keep the original baseline and only swap the offset.
    expect(mediaTimeAt(withOffset, 20).timeMs).toBe(1270)
  })
})

describe('pollPlayer — mocked IFrame player', () => {
  it('reads seconds from a mocked player and converts to ms', () => {
    const player: YoutubePlayerLike = {
      getCurrentTime: () => 6,
      getPlayerState: () => YT_PLAYING,
    }
    const poll = pollPlayer(player, 12_000, 80)
    const snap = applyPlayerPoll(undefined, poll)
    expect(mediaTimeAt(snap, 12_000).timeMs).toBe(6080)
    expect(mediaTimeAt(snap, 12_040).timeMs).toBe(6120)
  })
})
