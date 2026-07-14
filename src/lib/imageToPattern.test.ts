import { describe, expect, it } from 'vitest'
import { suggestGridForImage } from './imageToPattern'

// Miyuki Delica 11/0, the catalog default (src/data/beadTypes.ts).
const DELICA_W = 1.6
const DELICA_H = 1.3

describe('suggestGridForImage', () => {
  it('loom + Delica: a square photo comes out with more rows than cols, so the woven piece stays square', () => {
    const { cols, rows } = suggestGridForImage(400, 400, 'loom', DELICA_W, DELICA_H, 60)
    expect(rows).toBe(60)
    expect(cols).toBeLessThan(rows)
    // Physical size should be close to square (within one bead's width of rounding slack).
    const widthMm = cols * DELICA_W
    const heightMm = rows * DELICA_H
    expect(Math.abs(widthMm - heightMm)).toBeLessThan(DELICA_W)
  })

  it('peyote compacts rows further, so it needs even fewer columns than loom for the same square photo', () => {
    const loom = suggestGridForImage(400, 400, 'loom', DELICA_W, DELICA_H, 60)
    const peyote = suggestGridForImage(400, 400, 'peyote', DELICA_W, DELICA_H, 60)
    expect(peyote.cols).toBeLessThan(loom.cols)
  })

  it('a plain square-pixel bead (width == height) reduces to the old behavior: cols == rows for a square photo', () => {
    const { cols, rows } = suggestGridForImage(400, 400, 'loom', 1.5, 1.5, 60)
    expect(cols).toBe(rows)
  })

  it('never returns fewer than 4 in either dimension for an extreme aspect ratio', () => {
    const { cols, rows } = suggestGridForImage(4000, 100, 'peyote', DELICA_W, DELICA_H, 60)
    expect(cols).toBeGreaterThanOrEqual(4)
    expect(rows).toBeGreaterThanOrEqual(4)
  })

  it('a tall (portrait) photo yields more rows than columns', () => {
    const { cols, rows } = suggestGridForImage(300, 600, 'loom', DELICA_W, DELICA_H, 60)
    expect(rows).toBeGreaterThan(cols)
  })
})
