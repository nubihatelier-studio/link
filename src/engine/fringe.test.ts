import { describe, expect, it } from 'vitest'
import {
  createEmptyFringe,
  createFringeLengths,
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
