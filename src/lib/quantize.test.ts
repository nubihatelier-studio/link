import { describe, expect, it } from 'vitest'
import { rgbToLab, type Lab, type RGB } from './color'
import { kMeansQuantize, mergeSimilarColors } from './quantize'

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

function blend(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

describe('mergeSimilarColors', () => {
  it('leaves well-separated colors alone (mapping is the identity)', () => {
    const centroids: Lab[] = [
      { l: 20, a: 40, b: 10 },
      { l: 80, a: -30, b: 20 },
    ]
    const result = mergeSimilarColors(centroids, [10, 10], 6)
    expect(result.centroids).toHaveLength(2)
    expect(result.mapping).toEqual([0, 1])
  })

  it('merges two near-identical centroids into one, weighted by count', () => {
    const centroids: Lab[] = [
      { l: 50, a: 20, b: 20 },
      { l: 50.2, a: 20.1, b: 19.9 }, // a hair off — an anti-aliasing artifact of the first
    ]
    const result = mergeSimilarColors(centroids, [90, 10], 6)
    expect(result.centroids).toHaveLength(1)
    expect(result.counts).toEqual([100])
    expect(result.mapping).toEqual([0, 0])
    // Weighted mean should land much closer to the dominant (90-count) centroid.
    expect(result.centroids[0].l).toBeCloseTo(50.02, 1)
  })

  it('collapses a synthetic 4-flat-color-plus-anti-aliasing photo to at most 5-6 colors', () => {
    // Four distinct, well-separated flat colors (a real photo's actual regions)...
    const red: RGB = { r: 200, g: 60, b: 50 }
    const green: RGB = { r: 60, g: 160, b: 70 }
    const blue: RGB = { r: 50, g: 90, b: 190 }
    const yellow: RGB = { r: 210, g: 190, b: 60 }
    const flats = [red, green, blue, yellow]

    const pixels: RGB[] = []
    for (const c of flats) for (let i = 0; i < 200; i++) pixels.push(c)

    // ...plus anti-aliased edge pixels: every pair of flats blended at a couple
    // of mostly-one-side ratios (a real AA edge is 1 screen pixel wide, so after
    // downsampling to the pattern grid almost every edge pixel is a slight tint
    // of one region, not an even 50/50 mix), each contributing only a few pixels.
    for (let i = 0; i < flats.length; i++) {
      for (let j = i + 1; j < flats.length; j++) {
        for (const t of [0.08, 0.92]) {
          pixels.push(blend(flats[i], flats[j], t))
        }
      }
    }

    // numColors=12, matching the QA repro (a photo with only 4 real regions
    // regenerated with a generous color budget used to produce near-duplicates).
    const { centroids, counts } = kMeansQuantize(pixels, 12)
    const merged = mergeSimilarColors(centroids, counts)

    expect(merged.centroids.length).toBeLessThanOrEqual(6)
    // The 4 real flat colors must still be represented distinctly (not
    // over-merged into fewer than the photo's actual color count).
    expect(merged.centroids.length).toBeGreaterThanOrEqual(4)
  })

  it('is a no-op (identity mapping, unchanged centroids) for a single color', () => {
    const lab = rgbToLab({ r: 10, g: 20, b: 30 })
    const result = mergeSimilarColors([lab], [5])
    expect(result.centroids).toEqual([lab])
    expect(result.mapping).toEqual([0])
  })
})
