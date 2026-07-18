import { describe, expect, it } from 'vitest'
import {
  createEmptyFringe,
  createFringeLengths,
  createFringeLengthShape,
  createFringeLengthsForShape,
  fringeDepthOf,
  isFringeCapable,
  isFringeRow,
  isPaintableCell,
  maxFringeLength,
  normalizeFringe,
  totalFringeBeadCount,
} from './fringe'

describe('isFringeCapable', () => {
  it('brick and loom can carry a fringe, peyote cannot', () => {
    expect(isFringeCapable('brick')).toBe(true)
    expect(isFringeCapable('loom')).toBe(true)
    expect(isFringeCapable('peyote')).toBe(false)
  })
})

describe('createEmptyFringe', () => {
  it('creates all-zero, all-false arrays sized to cols', () => {
    expect(createEmptyFringe(3)).toEqual({ lengths: [0, 0, 0], turnBeads: [false, false, false] })
  })
})

describe('normalizeFringe', () => {
  it('returns an empty fringe when given undefined (legacy patterns)', () => {
    expect(normalizeFringe(undefined, 3)).toEqual({ lengths: [0, 0, 0], turnBeads: [false, false, false] })
  })

  it('pads a shorter fringe with zeros/false up to the current column count', () => {
    const result = normalizeFringe({ lengths: [5, 2], turnBeads: [true, false] }, 4)
    expect(result).toEqual({ lengths: [5, 2, 0, 0], turnBeads: [true, false, false, false] })
  })

  it('truncates a longer fringe down to the current column count', () => {
    const result = normalizeFringe({ lengths: [5, 2, 3, 1], turnBeads: [true, false, true, false] }, 2)
    expect(result).toEqual({ lengths: [5, 2], turnBeads: [true, false] })
  })
})

describe('maxFringeLength / totalFringeBeadCount', () => {
  it('report 0 for an undefined or all-empty fringe', () => {
    expect(maxFringeLength(undefined)).toBe(0)
    expect(totalFringeBeadCount(undefined)).toBe(0)
    expect(maxFringeLength(createEmptyFringe(3))).toBe(0)
    expect(totalFringeBeadCount(createEmptyFringe(3))).toBe(0)
  })

  it('compute the max and the sum across columns', () => {
    const fringe = { lengths: [3, 7, 5], turnBeads: [false, false, false] }
    expect(maxFringeLength(fringe)).toBe(7)
    expect(totalFringeBeadCount(fringe)).toBe(15)
  })
})

describe('isFringeRow / fringeDepthOf', () => {
  it('rows within the body are not fringe rows', () => {
    expect(isFringeRow(16, 0)).toBe(false)
    expect(isFringeRow(16, 15)).toBe(false)
  })

  it('rows at or past the body height are fringe rows, depth 0-based from there', () => {
    expect(isFringeRow(16, 16)).toBe(true)
    expect(fringeDepthOf(16, 16)).toBe(0)
    expect(fringeDepthOf(16, 20)).toBe(4)
  })
})

describe('isPaintableCell', () => {
  const fringe = { lengths: [3, 0, 5], turnBeads: [false, false, true] }

  it('accepts any body cell regardless of fringe', () => {
    expect(isPaintableCell(0, 0, 3, 10, fringe)).toBe(true)
    expect(isPaintableCell(9, 2, 3, 10, fringe)).toBe(true)
  })

  it('accepts a fringe cell within that column\'s current length', () => {
    expect(isPaintableCell(10, 0, 3, 10, fringe)).toBe(true) // depth 0 of col 0 (length 3)
    expect(isPaintableCell(12, 0, 3, 10, fringe)).toBe(true) // depth 2 of col 0 (length 3), the last one
    expect(isPaintableCell(14, 2, 3, 10, fringe)).toBe(true) // depth 4 of col 2 (length 5), the last one
  })

  it('rejects a fringe cell past that column\'s current length', () => {
    expect(isPaintableCell(13, 0, 3, 10, fringe)).toBe(false) // depth 3, col 0 only has length 3
  })

  it('rejects any depth at all for a column with no fringe', () => {
    expect(isPaintableCell(10, 1, 3, 10, fringe)).toBe(false)
  })

  it('rejects negative rows/cols and out-of-range columns', () => {
    expect(isPaintableCell(-1, 0, 3, 10, fringe)).toBe(false)
    expect(isPaintableCell(0, -1, 3, 10, fringe)).toBe(false)
    expect(isPaintableCell(0, 3, 3, 10, fringe)).toBe(false)
  })

  it('treats an omitted fringe as no fringe at all (body-only)', () => {
    expect(isPaintableCell(9, 0, 3, 10)).toBe(true)
    expect(isPaintableCell(10, 0, 3, 10)).toBe(false)
  })

  describe('with a shaped (rowShape) body', () => {
    // A 5-col, 3-row triangle: row 0 has 1 col centered, row 1 has 3, row 2 (the last, full-width) has 5.
    const rowShape = [
      { offset: 2, length: 1 },
      { offset: 1, length: 3 },
      { offset: 0, length: 5 },
    ]

    it('accepts a body cell within its own row\'s span', () => {
      expect(isPaintableCell(0, 2, 5, 3, undefined, rowShape)).toBe(true) // row 0's only column
      expect(isPaintableCell(1, 1, 5, 3, undefined, rowShape)).toBe(true) // row 1's left edge
      expect(isPaintableCell(1, 3, 5, 3, undefined, rowShape)).toBe(true) // row 1's right edge
    })

    it('rejects a body cell outside its own row\'s span, even though the column exists in the grid', () => {
      expect(isPaintableCell(0, 0, 5, 3, undefined, rowShape)).toBe(false)
      expect(isPaintableCell(0, 4, 5, 3, undefined, rowShape)).toBe(false)
      expect(isPaintableCell(1, 0, 5, 3, undefined, rowShape)).toBe(false)
      expect(isPaintableCell(1, 4, 5, 3, undefined, rowShape)).toBe(false)
    })

    it('an omitted rowShape entry for a row falls back to full width (defensive, matches normalizeRowShape default)', () => {
      const shortRowShape = [{ offset: 2, length: 1 }] // only row 0 has an entry, though bodyRows is 3
      expect(isPaintableCell(2, 0, 5, 3, undefined, shortRowShape)).toBe(true)
    })

    it('a fringe strand only exists under a column the LAST row reaches', () => {
      const fringe = { lengths: [3, 3, 3, 3, 3], turnBeads: [false, false, false, false, false] }
      // Last row (index 2) is full width (offset 0, length 5) here, so every column can have fringe.
      expect(isPaintableCell(3, 0, 5, 3, fringe, rowShape)).toBe(true)
      expect(isPaintableCell(3, 4, 5, 3, fringe, rowShape)).toBe(true)
    })

    it('rejects fringe under a column outside the last row\'s span, even with a positive fringe length', () => {
      const narrowLastRow = [
        { offset: 0, length: 5 },
        { offset: 0, length: 5 },
        { offset: 2, length: 1 }, // last row tapers to a single center column
      ]
      const fringe = { lengths: [3, 3, 3, 3, 3], turnBeads: [false, false, false, false, false] }
      expect(isPaintableCell(3, 2, 5, 3, fringe, narrowLastRow)).toBe(true) // the one column the point reaches
      expect(isPaintableCell(3, 0, 5, 3, fringe, narrowLastRow)).toBe(false) // outside the point
      expect(isPaintableCell(3, 4, 5, 3, fringe, narrowLastRow)).toBe(false)
    })
  })
})

describe('createFringeLengthsForShape', () => {
  it('generates the shape pattern only across the last row\'s span, zero-padding everywhere else', () => {
    const lengths = createFringeLengthsForShape('straight', 8, 5, { offset: 3, length: 2 })
    expect(lengths).toEqual([0, 0, 0, 5, 5, 0, 0, 0])
  })

  it('a "V" shape still peaks at the center of the (narrower) last row, not the full grid', () => {
    const lengths = createFringeLengthsForShape('v', 10, 9, { offset: 4, length: 3 })
    expect(lengths[4]).toBe(1) // left edge of the row's own span
    expect(lengths[5]).toBe(9) // center of the row's own span
    expect(lengths[6]).toBe(1) // right edge
    expect(lengths.slice(0, 4)).toEqual([0, 0, 0, 0])
    expect(lengths.slice(7)).toEqual([0, 0, 0])
  })

  it('a full-width last row behaves exactly like createFringeLengths', () => {
    const fullRow = { offset: 0, length: 6 }
    expect(createFringeLengthsForShape('v', 6, 7, fullRow)).toEqual(createFringeLengths('v', 6, 7))
  })
})

describe('createFringeLengths', () => {
  it('straight: every column gets the same length', () => {
    expect(createFringeLengths('straight', 5, 8)).toEqual([8, 8, 8, 8, 8])
  })

  it('v: longest at the center, tapering to 1 at both edges', () => {
    const lengths = createFringeLengths('v', 5, 9)
    expect(lengths[2]).toBe(9) // center column
    expect(lengths[0]).toBe(1) // left edge
    expect(lengths[4]).toBe(1) // right edge
    expect(lengths[0]).toBeLessThan(lengths[1])
    expect(lengths[1]).toBeLessThan(lengths[2])
  })

  it('cascade: repeats an ascending 1/4-2/4-3/4-4/4 staircase every 4 columns', () => {
    const lengths = createFringeLengths('cascade', 8, 8)
    expect(lengths).toEqual([2, 4, 6, 8, 2, 4, 6, 8])
  })

  it('returns an all-zero array when maxLength is 0', () => {
    expect(createFringeLengths('straight', 4, 0)).toEqual([0, 0, 0, 0])
    expect(createFringeLengths('v', 4, 0)).toEqual([0, 0, 0, 0])
  })

  it('handles a single column without dividing by zero', () => {
    expect(createFringeLengths('v', 1, 5)).toEqual([5])
  })
})

describe('createFringeLengthShape', () => {
  it('v: longest at the center, tapering linearly to min at both edges', () => {
    const lengths = createFringeLengthShape('v', 5, 2, 10)
    expect(lengths[2]).toBe(10) // center column
    expect(lengths[0]).toBe(2) // left edge
    expect(lengths[4]).toBe(2) // right edge
    expect(lengths[0]).toBeLessThan(lengths[1])
    expect(lengths[1]).toBeLessThan(lengths[2])
  })

  it('vInverted: shortest at the center, tapering linearly to max at both edges', () => {
    const lengths = createFringeLengthShape('vInverted', 5, 2, 10)
    expect(lengths[2]).toBe(2) // center column
    expect(lengths[0]).toBe(10) // left edge
    expect(lengths[4]).toBe(10) // right edge
    expect(lengths[0]).toBeGreaterThan(lengths[1])
    expect(lengths[1]).toBeGreaterThan(lengths[2])
  })

  it('diagonalLR: ramps from min at column 1 up to max at the last column', () => {
    const lengths = createFringeLengthShape('diagonalLR', 5, 2, 10)
    expect(lengths[0]).toBe(2)
    expect(lengths[4]).toBe(10)
    expect(lengths[0]).toBeLessThan(lengths[1])
    expect(lengths[1]).toBeLessThan(lengths[2])
    expect(lengths[2]).toBeLessThan(lengths[3])
    expect(lengths[3]).toBeLessThan(lengths[4])
  })

  it('diagonalRL: ramps from max at column 1 down to min at the last column', () => {
    const lengths = createFringeLengthShape('diagonalRL', 5, 2, 10)
    expect(lengths[0]).toBe(10)
    expect(lengths[4]).toBe(2)
    expect(lengths[0]).toBeGreaterThan(lengths[1])
    expect(lengths[3]).toBeGreaterThan(lengths[4])
  })

  it('curve: same endpoints as v (max at center, min at edges) but eased, not a straight line', () => {
    const straight = createFringeLengthShape('v', 9, 2, 10)
    const curved = createFringeLengthShape('curve', 9, 2, 10)
    expect(curved[4]).toBe(straight[4]) // center matches
    expect(curved[0]).toBe(straight[0]) // left edge matches
    expect(curved[8]).toBe(straight[8]) // right edge matches
    // Near the edges, the cosine ease stays closer to the min than the linear taper does.
    expect(curved[1]).toBeLessThan(straight[1])
  })

  it('swaps min/max if given in reverse order, and never returns a length below 0', () => {
    expect(createFringeLengthShape('diagonalLR', 4, 10, 2)).toEqual(createFringeLengthShape('diagonalLR', 4, 2, 10))
    expect(createFringeLengthShape('v', 4, -5, 3).every((n) => n >= 0)).toBe(true)
  })

  it('handles a single column without dividing by zero', () => {
    expect(createFringeLengthShape('v', 1, 2, 10)).toEqual([10])
  })

  it('handles a non-positive column count', () => {
    expect(createFringeLengthShape('v', 0, 2, 10)).toEqual([])
  })
})
