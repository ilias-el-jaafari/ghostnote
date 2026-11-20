import { useEffect, useRef } from 'react'
import { PLAYER_PALETTE } from '../visual/themes.ts'

type WaveformProps = {
  analyser: AnalyserNode | undefined
  active?: boolean
}

const BAR_COLORS = [...PLAYER_PALETTE, '#7af0ff']

export function Waveform({ analyser, active = true }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    const freq = new Uint8Array(analyser?.frequencyBinCount ?? 512)

    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio))
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.clearRect(0, 0, width, height)

      if (analyser && active) {
        analyser.getByteFrequencyData(freq)
      } else {
        freq.fill(0)
      }

      const bars = Math.min(64, freq.length)
      const gap = Math.max(1, ratio)
      const barWidth = width / bars
      for (let i = 0; i < bars; i++) {
        const value = (freq[i] ?? 0) / 255
        const barHeight = Math.max(2 * ratio, value * height * 0.95)
        const x = i * barWidth
        const hex = BAR_COLORS[i % BAR_COLORS.length] ?? '#7af0ff'
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height)
        gradient.addColorStop(0, hex)
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)')
        ctx.fillStyle = gradient
        ctx.fillRect(x + gap, height - barHeight, Math.max(barWidth - gap * 2, 1), barHeight)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active, analyser])

  return <canvas ref={canvasRef} className="waveform-canvas" aria-hidden="true" />
}
