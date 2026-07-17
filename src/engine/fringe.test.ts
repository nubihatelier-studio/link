import { describe, expect, it } from 'vitest'
import {
  createEmptyFringe,
  createFringeLengths,
  fringeDepthOf,
  isFringeCapable,
  isFringeRow,
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
