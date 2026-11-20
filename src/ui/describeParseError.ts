import { UltraStarParseError } from '../parser/index.ts'

export function describeParseError(error: unknown): string {
  if (error instanceof UltraStarParseError) {
    if (error.lineNumber !== undefined) {
      return `Line ${error.lineNumber}: ${error.message}`
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Could not parse that song file.'
}
