import { describe, expect, it } from 'vitest'
import { ParticleEngine } from './particles.ts'

describe('ParticleEngine', () => {
  it('spawns a burst and a flare, then expires them', () => {
    const engine = new ParticleEngine({ maxParticles: 40, random: () => 0.5 })
    engine.spawnBurst(10, 20, true, 8)
    engine.spawnFlare(10, 20, true)
    expect(engine.count).toBe(9)
    expect(engine.particles.some((particle) => particle.kind === 'flare')).toBe(true)
    engine.tick(2)
    expect(engine.count).toBe(0)
  })

  it('respects the particle cap', () => {
    const engine = new ParticleEngine({ maxParticles: 5, random: () => 0.2 })
    engine.spawnBurst(0, 0, false, 20)
    expect(engine.count).toBe(5)
  })

  it('does not spawn when the cap is zero (low-end / reduced motion)', () => {
    const engine = new ParticleEngine({ maxParticles: 0 })
    engine.spawnBurst(0, 0, true, 10)
    engine.spawnFlare(0, 0, true)
    expect(engine.count).toBe(0)
  })
})
