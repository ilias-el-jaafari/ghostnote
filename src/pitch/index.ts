export {
  A4_HZ,
  A4_MIDI,
  C4_MIDI,
  PITCH_CLASS_NAMES,
  comparePitchOctaveTolerant,
  centsDifference,
  frequencyToMidi,
  frequencyToNoteName,
  midiToFrequency,
  midiToNoteName,
  midiToUltraStarPitch,
  octaveTolerantCents,
  pitchClass,
  ultraStarPitchToMidi,
  type NamedNote,
  type PitchClassName,
  type PitchMatch,
} from './note.ts'
export {
  detectPitchYin,
  interpolateTau,
  localMinimumTau,
  preferFundamentalTau,
  shouldPreferLongerPeriod,
  synthesizeHarmonicTone,
  synthesizeSine,
  DEFAULT_MAX_PITCH_HZ,
  DEFAULT_MIN_PITCH_HZ,
  RECOMMENDED_PITCH_WINDOW,
  pitchWindowSamples,
  type PitchDetectionResult,
  type PitchDetectorOptions,
} from './yin.ts'
export {
  centsBetween,
  isClosePitch,
  isOctaveOrHarmonicJump,
  medianOf,
  OctaveHysteresis,
  type OctaveHysteresisOptions,
} from './smooth.ts'

export { detectPitch, selectFundamental, isNearMultiple, type CombinedPitchResult, type PitchCandidate } from './detect.ts'
export { detectPitchMpm, computeNsdf, findNsdfPeaks, MPM_CUTOFF, type MpmOptions, type MpmPeak } from './mpm.ts'
export { synthesizeFormantVoice, type Formant } from './voice.ts'
export {
  buildDebugCaptureZip,
  encodeWavPcm16,
  zipStore,
  DEBUG_CAPTURE_MS,
  type DebugCaptureMeta,
  type DebugPitchFrame,
} from './debugCapture.ts'
export { ANALYSIS_HIGHPASS_HZ, MIC_AUDIO_CONSTRAINTS } from './usePitchDetection.ts'
export {
  applyMicConstraints,
  readTrackSettings,
  voiceProcessingStillOn,
  type MicProcessingSettings,
} from './micConstraints.ts'
export { shareOrDownloadBytes, downloadBytes } from './debugCapture.ts'
export { isNearOctaveBelow } from './detect.ts'
