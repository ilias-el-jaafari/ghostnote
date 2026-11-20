/** Pair UltraStar chart files with audio files from a multi-file or folder pick. */

export const AUDIO_EXTENSIONS = [
  '.mp3',
  '.ogg',
  '.oga',
  '.wav',
  '.webm',
  '.m4a',
  '.aac',
  '.flac',
  '.opus',
] as const

export type NamedFile = {
  name: string
  type?: string
}

export type AudioMatchReason = 'header' | 'basename' | 'single' | 'none'

export type PairedChart<T extends NamedFile = NamedFile> = {
  chart: T
  audio: T | undefined
  reason: AudioMatchReason
}

export type PairingResult<T extends NamedFile = NamedFile> = {
  charts: PairedChart<T>[]
  leftoverAudio: T[]
}

export function fileName(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? path
}

export function fileStem(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase()
}

export function fileExtension(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function isChartFile(path: string, mime?: string): boolean {
  const ext = fileExtension(path)
  if (ext === '.txt') return true
  return ext === '' && (mime === 'text/plain' || mime === 'text/utf-8')
}

export function isAudioFile(path: string, mime?: string): boolean {
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(fileExtension(path))) return true
  return Boolean(mime && mime.startsWith('audio/'))
}

/**
 * Find the best audio file for one chart.
 *
 * Priority: `#MP3` / `#AUDIO` header name, then same basename as the chart,
 * then the only audio file in the batch (when there is also only one chart).
 */
export function findAudioForChart<T extends NamedFile>(
  chartName: string,
  audioFiles: readonly T[],
  headerAudio?: string,
  options: { onlyChart?: boolean } = {},
): { file: T; reason: Exclude<AudioMatchReason, 'none'> } | undefined {
  if (audioFiles.length === 0) return undefined

  if (headerAudio) {
    const headerName = fileName(headerAudio).toLowerCase()
    const headerStem = fileStem(headerAudio)
    const exact = audioFiles.find((file) => fileName(file.name).toLowerCase() === headerName)
    if (exact) return { file: exact, reason: 'header' }
    const stemmed = audioFiles.find((file) => fileStem(file.name) === headerStem)
    if (stemmed) return { file: stemmed, reason: 'header' }
  }

  const chartStem = fileStem(chartName)
  const sameName = audioFiles.find((file) => fileStem(file.name) === chartStem)
  if (sameName) return { file: sameName, reason: 'basename' }

  if (options.onlyChart && audioFiles.length === 1) {
    const only = audioFiles[0]
    if (only) return { file: only, reason: 'single' }
  }

  return undefined
}

export function pairSongFiles<T extends NamedFile>(
  files: readonly T[],
  headerAudioByChart?: ReadonlyMap<string, string | undefined>,
): PairingResult<T> {
  const charts = files.filter((file) => isChartFile(file.name, file.type))
  const audioFiles = files.filter((file) => isAudioFile(file.name, file.type))
  const used = new Set<T>()
  const onlyChart = charts.length === 1

  const paired: PairedChart<T>[] = charts.map((chart) => {
    const header = headerAudioByChart?.get(chart.name)
    const match = findAudioForChart(chart.name, audioFiles.filter((file) => !used.has(file)), header, {
      onlyChart,
    })
    if (match) used.add(match.file)
    return {
      chart,
      audio: match?.file,
      reason: match?.reason ?? 'none',
    }
  })

  return {
    charts: paired,
    leftoverAudio: audioFiles.filter((file) => !used.has(file)),
  }
}
