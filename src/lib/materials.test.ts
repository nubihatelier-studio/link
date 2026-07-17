import { describe, expect, it } from 'vitest'
import type { BeadTypeDef } from '@/engine/types'
import { estimateThreadMeters, suggestedNeedle } from './materials'

const DELICA_WIDTH = 1.6
const ROCALLA_WIDTH = 2.1

describe('estimateThreadMeters', () => {
  it('loom uses a single thread pass per bead', () => {
    const loom = estimateThreadMeters('loom', 10, 10, DELICA_WIDTH)
    // 100 beads * 1 pass * 1.6mm * 1.3 margin = 208mm = 0.208m
    expect(loom).toBeCloseTo(0.208, 5)
  })

  it('peyote/brick use twice the thread of loom for the same grid (interlocking stitch)', () => {
    const loom = estimateThreadMeters('loom', 10, 10, DELICA_WIDTH)
    const peyote = estimateThreadMeters('peyote', 10, 10, DELICA_WIDTH)
    const brick = estimateThreadMeters('brick', 10, 10, DELICA_WIDTH)
    expect(peyote).toBeCloseTo(loom * 2, 5)
    expect(brick).toBeCloseTo(loom * 2, 5)
  })

  it('scales linearly with bead count', () => {
    const small = estimateThreadMeters('peyote', 10, 10, DELICA_WIDTH)
    const big = estimateThreadMeters('peyote', 20, 10, DELICA_WIDTH)
    expect(big).toBeCloseTo(small * 2, 5)
  })

  it('folds fringe beads in at 2 thread passes each, regardless of the body technique', () => {
    const withoutFringe = estimateThreadMeters('loom', 10, 10, DELICA_WIDTH)
    const withFringe = estimateThreadMeters('loom', 10, 10, DELICA_WIDTH, 5)
    // 5 fringe beads * 2 passes * 1.6mm * 1.3 margin = 20.8mm = 0.0208m
    expect(withFringe - withoutFringe).toBeCloseTo(0.0208, 5)
  })

  it('defaults to no fringe when the argument is omitted', () => {
    expect(estimateThreadMeters('brick', 10, 10, DELICA_WIDTH)).toBe(estimateThreadMeters('brick', 10, 10, DELICA_WIDTH, 0))
  })
})

describe('suggestedNeedle', () => {
  const delica: BeadTypeDef = {
    id: 'miyuki-delica-11',
    brand: 'Miyuki',
    line: 'Delica',
    size: '11/0',
    label: 'Miyuki Delica 11/0',
    widthMm: DELICA_WIDTH,
    heightMm: 1.3,
    shape: 'cylinder',
  }
  const rocalla: BeadTypeDef = { ...delica, id: 'rocalla-11', widthMm: ROCALLA_WIDTH, shape: 'round' }
  const wide: BeadTypeDef = { ...delica, id: 'wide', widthMm: 3.0 }

  it('suggests a #12/13 for narrow beads like Delica 11/0', () => {
    expect(suggestedNeedle(delica)).toContain('12')
  })

  it('suggests a #10/12 for mid-width beads like Rocalla 11/0', () => {
    expect(suggestedNeedle(rocalla)).toContain('10')
  })

  it('suggests a sturdier #10 for wide beads', () => {
    expect(suggestedNeedle(wide)).toBe('Aguja para bead N.º 10')
  })
})
