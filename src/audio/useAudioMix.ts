import { useCallback, useState } from 'react'
import {
  DEFAULT_GUIDE_VOLUME,
  DEFAULT_MIC_SENSITIVITY,
  GUIDE_VOLUME_STORAGE_KEY,
  MIC_SENSITIVITY_STORAGE_KEY,
  persistUnit,
  readStoredUnit,
} from './mix.ts'

function storage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  return window.localStorage
}

export function useAudioMix() {
  const [guideVolume, setGuideVolumeState] = useState(() =>
    readStoredUnit(GUIDE_VOLUME_STORAGE_KEY, DEFAULT_GUIDE_VOLUME, storage()),
  )
  const [micSensitivity, setMicSensitivityState] = useState(() =>
    readStoredUnit(MIC_SENSITIVITY_STORAGE_KEY, DEFAULT_MIC_SENSITIVITY, storage()),
  )

  const setGuideVolume = useCallback((value: number) => {
    setGuideVolumeState(value)
    persistUnit(GUIDE_VOLUME_STORAGE_KEY, value, storage())
  }, [])

  const setMicSensitivity = useCallback((value: number) => {
    setMicSensitivityState(value)
    persistUnit(MIC_SENSITIVITY_STORAGE_KEY, value, storage())
  }, [])

  return { guideVolume, setGuideVolume, micSensitivity, setMicSensitivity }
}
