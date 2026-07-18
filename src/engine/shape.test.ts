import { describe, expect, it } from 'vitest'
import {
  createRectangleRowShape,
  createShapedRowShape,
  isShapeCapable,
  maxRowWidth,
  normalizeRowShape,
} from './shape'

describe('isShapeCapable', () => {
  it('only brick can have a shaped body', () => {
    expect(isShapeCapable('brick')).toBe(true)
    expect(isShapeCapable('loom')).toBe(false)
    expect(isShapeCapable('peyote')).toBe(false)
  })
})

describe('createRectangleRowShape', () => {
  it('every row full width, starting at column 0', () => {
    expect(createRectangleRowShape(4, 3)).toEqual([
      { offset: 0, length: 4 },
      { offset: 0, length: 4 },
      { offset: 0, length: 4 },
    ])
  })
})

describe('normalizeRowShape', () => {
  it('returns a full rectangle when given undefined (legacy patterns)', () => {
    expect(normalizeRowShape(undefined, 3, 2)).toEqual([
      { offset: 0, length: 3 },
      { offset: 0, length: 3 },
    ])
  })

  it('pads a shorter array with full-width rows up to the current row count', () => {
    const result = normalizeRowShape([{ offset: 1, length: 1 }], 3, 3)
    expect(result).toEqual([
      { offset: 1, length: 1 },
      { offset: 0, length: 3 },
      { offset: 0, length: 3 },
    ])
  })

  it('truncates a longer array down to the current row count', () => {
    const result = normalizeRowShape(
      [
        { offset: 1, length: 1 },
        { offset: 0, length: 3 },
        { offset: 0, length: 3 },
      ],
      3,
      1,
    )
    expect(result).toEqual([{ offset: 1, length: 1 }])
  })

  it('clamps length to at least 1 and at most cols', () => {
    expect(normalizeRowShape([{ offset: 0, length: 0 }], 5, 1)).toEqual([{ offset: 0, length: 1 }])
    expect(normalizeRowShape([{ offset: 0, length: 99 }], 5, 1)).toEqual([{ offset: 0, length: 5 }])
  })

  it('clamps offset so offset + length never exceeds cols', () => {
    expect(normalizeRowShape([{ offset: 99, length: 2 }], 5, 1)).toEqual([{ offset: 3, length: 2 }])
    expect(normalizeRowShape([{ offset: -5, length: 2 }], 5, 1)).toEqual([{ offset: 0, length: 2 }])
  })
})

describe('maxRowWidth', () => {
  it('the widest row\'s length', () => {
    const rowShape = [
      { offset: 2, length: 1 },
      { offset: 0, length: 5 },
      { offset: 1, length: 3 },
    ]
    expect(maxRowWidth(rowShape)).toBe(5)
  })

  it('0 for an empty array', () => {
    expect(maxRowWidth([])).toBe(0)
  })
})

describe('createShapedRowShape', () => {
  it('rectangle: every row full width, same as createRectangleRowShape', () => {
    expect(createShapedRowShape('rectangle', 5, 4)).toEqual(createRectangleRowShape(5, 4))
  })

  it('triangle: narrow top (1 bead), full-width bottom, centered', () => {
    const shape = createShapedRowShape('triangle', 7, 4)
    expect(shape[0]).toEqual({ offset: 3, length: 1 }) // top: 1 bead, centered
    expect(shape[3]).toEqual({ offset: 0, length: 7 }) // bottom: full width
    // Width increases monotonically top to bottom.
    for (let i = 1; i < shape.length; i++) expect(shape[i].length).toBeGreaterThanOrEqual(shape[i - 1].length)
  })

  it('triangleInverted: full-width top, narrow bottom (1 bead), centered', () => {
    const shape = createShapedRowShape('triangleInverted', 7, 4)
    expect(shape[0]).toEqual({ offset: 0, length: 7 })
    expect(shape[3]).toEqual({ offset: 3, length: 1 })
    for (let i = 1; i < shape.length; i++) expect(shape[i].length).toBeLessThanOrEqual(shape[i - 1].length)
  })

  it('rhombus: narrow at both ends, widest at the middle row, centered', () => {
    const shape = createShapedRowShape('rhombus', 9, 5)
    expect(shape[0].length).toBe(1)
    expect(shape[4].length).toBe(1)
    expect(shape[2]).toEqual({ offset: 0, length: 9 }) // middle row: full width
    expect(shape[1].length).toBeLessThan(shape[2].length)
    expect(shape[3].length).toBeLessThan(shape[2].length)
  })

  it('every row stays centered: offset + length/2 is within half a bead of the grid\'s midpoint', () => {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as const) {
      const shape = createShapedRowShape(preset, 10, 6)
      for (const row of shape) {
        // cols=10 is even, so exact centering isn't possible for every width — allow half a bead of slack.
        expect(Math.abs(row.offset + row.length / 2 - 5)).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it('a single-row body does not divide by zero', () => {
    expect(createShapedRowShape('triangle', 5, 1)).toEqual([{ offset: 0, length: 5 }])
  })
})
