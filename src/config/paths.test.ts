import { describe, expect, it } from 'vitest'
import { publicUrl } from './paths.ts'

describe('publicUrl', () => {
  it('joins the Vite base with a public asset path', () => {
    const url = publicUrl('/songs/midnight-echo.ogg')
    expect(url.endsWith('songs/midnight-echo.ogg')).toBe(true)
    expect(url.startsWith(import.meta.env.BASE_URL)).toBe(true)
    expect(url).not.toContain('//songs')
  })
})
