import { useEffect, useRef } from 'react'

type WaveformProps = {
  analyser: AnalyserNode | undefined
  active?: boolean
}

export function Waveform({ analyser, active = true }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    const time = new Uint8Array(analyser?.fftSize ?? 1024)
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
      ctx.fillStyle = 'rgba(0, 8, 16, 0.35)'
      ctx.fillRect(0, 0, width, height)

      if (analyser && active) {
        analyser.getByteTimeDomainData(time)
        analyser.getByteFrequencyData(freq)
      } else {
        time.fill(128)
        freq.fill(0)
      }

      const bars = Math.min(48, freq.length)
      const barWidth = width / bars
      for (let i = 0; i < bars; i++) {
        const value = (freq[i] ?? 0) / 255
        const barHeight = value * height * 0.45
        const x = i * barWidth
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height)
        gradient.addColorStop(0, 'rgba(180, 255, 255, 0.85)')
        gradient.addColorStop(1, 'rgba(80, 200, 255, 0.15)')
        ctx.fillStyle = gradient
        ctx.fillRect(x + 1, height - barHeight, Math.max(barWidth - 2, 1), barHeight)
      }

      ctx.lineWidth = Math.max(2, ratio)
      ctx.strokeStyle = 'rgba(220, 255, 255, 0.95)'
      ctx.beginPath()
      const slice = width / time.length
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] ?? 128) / 128.0
        const x = i * slice
        const y = (v * 0.55 + 0.1) * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active, analyser])

  return <canvas ref={canvasRef} className="waveform-canvas" aria-hidden="true" />
}
