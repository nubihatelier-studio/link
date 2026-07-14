import { describe, expect, it } from 'vitest'
import type { RGB } from './color'
import { kMeansQuantize } from './quantize'

describe('kMeansQuantize', () => {
  it('returns nothing for an empty pixel list', () => {
    expect(kMeansQuantize([], 4)).toEqual({ centroids: [], counts: [] })
  })

  it('never returns more clusters than distinct pixels, even if k asks for more', () => {
    const pixels: RGB[] = [{ r: 255, g: 0, b: 0 }]
    const { centroids, counts } = kMeansQuantize(pixels, 5)
    expect(centroids).toHaveLength(1)
    expect(counts).toEqual([1])
  })

  it('separates two far-apart color clusters and assigns the right count to each', () => {
    const red: RGB = { r: 255, g: 0, b: 0 }
    const blue: RGB = { r: 0, g: 0, b: 255 }
    const pixels: RGB[] = [red, red, red, blue, blue]

    const { centroids, counts } = kMeansQuantize(pixels, 2)

    expect(centroids).toHaveLength(2)
    // Counts should reflect the 3-vs-2 split, in some order.
    expect(counts.slice().sort()).toEqual([2, 3])
  })

  it('a single requested cluster collapses to the mean of all pixels', () => {
    const pixels: RGB[] = [
      { r: 0, g: 0, b: 0 },
      { r: 100, g: 100, b: 100 },
    ]
    const { centroids, counts } = kMeansQuantize(pixels, 1)
    expect(centroids).toHaveLength(1)
    expect(counts).toEqual([2])
  })
})
