import { useEffect, useRef, useState } from 'react'
import { MilkdropRenderer } from './milkdrop.ts'
import type { QualitySettings } from './quality.ts'
import { THEMES, type ThemeId } from './themes.ts'

type MilkDropBackgroundProps = {
  settings: QualitySettings
  themeId: ThemeId
  onFps?: (fps: number) => void
}

export function MilkDropBackground({ settings, themeId, onFps }: MilkDropBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const themeRef = useRef(themeId)
  const [failed, setFailed] = useState(false)
  const fallback = !settings.useWebGL || failed
  const fallbackStyle = fallback ? { backgroundImage: THEMES[themeId].fallback } : undefined

  useEffect(() => {
    themeRef.current = themeId
  }, [themeId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !settings.useWebGL) return
    const renderer = new MilkdropRenderer(canvas)
    if (!renderer.ok) {
      setFailed(true)
      renderer.destroy()
      return
    }
    const apply = () => {
      renderer.configure({
        scale: settings.shaderScale,
        octaves: settings.fractalOctaves,
        motion: settings.animateBackground ? 1 : 0,
        mode: THEMES[themeRef.current].shaderMode,
      })
    }
    apply()
    if (!settings.animateBackground) {
      renderer.render()
      return () => renderer.destroy()
    }
    let frame = 0
    let last = performance.now()
    let windowMs = 0
    let frames = 0
    const loop = (now: number) => {
      apply()
      renderer.render(now)
      windowMs += now - last
      last = now
      frames += 1
      if (windowMs >= 2000) {
        onFps?.(Math.round((frames * 1000) / windowMs))
        windowMs = 0
        frames = 0
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      renderer.destroy()
    }
  }, [onFps, settings])

  return (
    <div
      className={fallback ? 'stage-bg stage-bg-fallback' : 'stage-bg'}
      style={fallbackStyle}
      aria-hidden="true"
    >
      {settings.useWebGL && !failed ? (
        <canvas ref={canvasRef} className="stage-bg-canvas" />
      ) : null}
    </div>
  )
}
