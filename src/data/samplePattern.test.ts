import { describe, expect, it } from 'vitest'
import { isFringeCapable } from '@/engine/fringe'
import { buildSamplePattern } from './samplePattern'

describe('buildSamplePattern', () => {
  it('produces a fringe-capable technique with every body cell painted', () => {
    const sample = buildSamplePattern()
    expect(isFringeCapable(sample.config.technique)).toBe(true)
    for (let row = 0; row < sample.config.rows; row++) {
      for (let col = 0; col < sample.config.cols; col++) {
        expect(sample.cells[`${row},${col}`]).toBeTruthy()
      }
    }
  })

  it('has a real, varied fringe with at least one column reaching the requested max length', () => {
    const sample = buildSamplePattern()
    expect(sample.fringe.lengths.length).toBe(sample.config.cols)
    expect(Math.max(...sample.fringe.lengths)).toBeGreaterThan(0)
    expect(sample.fringe.turnBeads.some(Boolean)).toBe(true)
  })

  it('paints every fringe cell implied by fringe.lengths', () => {
    const sample = buildSamplePattern()
    const { rows } = sample.config
    for (let col = 0; col < sample.config.cols; col++) {
      const length = sample.fringe.lengths[col]
      for (let depth = 0; depth < length; depth++) {
        expect(sample.cells[`${rows + depth},${col}`]).toBeTruthy()
      }
    }
  })

  it('gives the sample a recognizable name', () => {
    expect(buildSamplePattern().name).toContain('muestra')
  })
})
