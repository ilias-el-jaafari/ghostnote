/** Additive Canvas 2D particles and lens flares. */

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  r: number
  g: number
  b: number
  kind: 'mote' | 'flare' | 'bubble'
}

export type ParticleEngineOptions = {
  maxParticles: number
  random?: () => number
}

const GOLD = { r: 255, g: 230, b: 130 }
const LIME = { r: 160, g: 255, b: 190 }
const AQUA = { r: 140, g: 230, b: 255 }

export class ParticleEngine {
  particles: Particle[] = []
  readonly maxParticles: number
  private readonly random: () => number

  constructor(options: ParticleEngineOptions) {
    this.maxParticles = options.maxParticles
    this.random = options.random ?? Math.random
  }

  get count(): number {
    return this.particles.length
  }

  clear() {
    this.particles.length = 0
  }

  private push(particle: Particle) {
    if (this.maxParticles <= 0) return
    if (this.particles.length >= this.maxParticles) this.particles.shift()
    this.particles.push(particle)
  }

  spawnBurst(x: number, y: number, golden: boolean, count = 14) {
    const tint = golden ? GOLD : LIME
    for (let i = 0; i < count; i++) {
      const speed = 20 + this.random() * 90
      const angle = this.random() * Math.PI * 2
      this.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.45 + this.random() * 0.5,
        maxLife: 0.45 + this.random() * 0.5,
        size: golden ? 5 + this.random() * 7 : 3 + this.random() * 5,
        r: tint.r,
        g: tint.g,
        b: tint.b,
        kind: this.random() > 0.35 ? 'mote' : 'bubble',
      })
    }
  }

  spawnFlare(x: number, y: number, golden: boolean) {
    const tint = golden ? GOLD : AQUA
    this.push({
      x,
      y,
      vx: 0,
      vy: -6,
      life: 0.28,
      maxLife: 0.28,
      size: golden ? 72 : 48,
      r: tint.r,
      g: tint.g,
      b: tint.b,
      kind: 'flare',
    })
  }

  /** Continuous sparkle while a golden (or hit) note sits on the now line. */
  spawnStream(x: number, y: number, golden: boolean, dt: number) {
    const chance = golden ? dt * 28 : dt * 10
    if (this.random() > chance) return
    this.spawnBurst(x, y, golden, golden ? 3 : 2)
    if (golden && this.random() < dt * 8) this.spawnFlare(x, y, true)
  }

  tick(dt: number) {
    const next: Particle[] = []
    for (const particle of this.particles) {
      particle.life -= dt
      if (particle.life <= 0) continue
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      if (particle.kind === 'bubble') {
        particle.vy -= 40 * dt
        particle.vx *= 0.98
      } else {
        particle.vy += 18 * dt
        particle.vx *= 0.99
      }
      next.push(particle)
    }
    this.particles = next
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const particle of this.particles) {
      const age = Math.max(0, particle.life / particle.maxLife)
      const alpha = age * age
      if (particle.kind === 'flare') {
        drawFlare(ctx, particle, alpha)
      } else {
        const radius = particle.size * (0.6 + 0.4 * age)
        const gradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          radius,
        )
        gradient.addColorStop(0, `rgba(${particle.r},${particle.g},${particle.b},${0.95 * alpha})`)
        gradient.addColorStop(0.45, `rgba(${particle.r},${particle.g},${particle.b},${0.45 * alpha})`)
        gradient.addColorStop(1, `rgba(${particle.r},${particle.g},${particle.b},0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

function drawStarBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  tint: { r: number; g: number; b: number },
) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, size)
  glow.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`)
  glow.addColorStop(0.16, `rgba(${tint.r},${tint.g},${tint.b},${0.75 * alpha})`)
  glow.addColorStop(1, `rgba(${tint.r},${tint.g},${tint.b},0)`)
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = `rgba(255,255,255,${0.8 * alpha})`
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4
    const length = i % 2 === 0 ? size * 2.3 : size * 1.25
    ctx.lineWidth = i % 2 === 0 ? 2.4 : 1.3
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length)
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    ctx.stroke()
  }
}

function drawFlare(ctx: CanvasRenderingContext2D, particle: Particle, alpha: number) {
  drawStarBurst(ctx, particle.x, particle.y, particle.size, alpha, {
    r: particle.r,
    g: particle.g,
    b: particle.b,
  })
}

export const NOW_LINE_RATIO = 0.2


/** A stable lens flare used on the now line / golden notes (drawn every frame). */
export function drawPersistentFlare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  intensity = 1,
  golden = false,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const tint = golden ? { r: 255, g: 230, b: 140 } : { r: 180, g: 240, b: 255 }
  const size = (golden ? 118 : 78) * intensity
  drawStarBurst(ctx, x, y, size, intensity, tint)
  ctx.restore()
}
