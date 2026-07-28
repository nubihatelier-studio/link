import { describe, expect, it } from 'vitest'
import { isOddIndex } from './geometry'
import {
  createRectangleRowShape,
  createShapedRowShape,
  isShapeCapable,
  maxRowWidth,
  normalizeRowShape,
} from './shape'

/** Physical left edge of a brick row, in bead units — the row's own index offset plus brick's per-row 0.5 stagger (see `geometry.ts#cellPosition`). */
function physicalLeft(row: number, offset: number): number {
  return offset + (isOddIndex(row) ? 0.5 : 0)
}
function physicalRight(row: number, offset: number, length: number, cols: number): number {
  return cols - (offset + length + (isOddIndex(row) ? 0.5 : 0))
}

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

  it('every row stays centered on the pattern\'s physical axis (accounting for brick\'s own 0.5 stagger), not just its raw index', () => {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as const) {
      const shape = createShapedRowShape(preset, 10, 6)
      shape.forEach((row, r) => {
        const left = physicalLeft(r, row.offset)
        const right = physicalRight(r, row.offset, row.length, 10)
        // A half-bead rounding slack on the offset shows up as at most a full
        // bead of left/right difference (see Corrección 1 tests below) — the
        // unavoidable case when the row's parity and (cols-width)'s parity
        // mismatch, not a sign the row is off-center.
        expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
      })
    }
  })

  it('a single-row body does not divide by zero', () => {
    expect(createShapedRowShape('triangle', 5, 1)).toEqual([{ offset: 0, length: 5 }])
  })
})

describe('createShapedRowShape — symmetric generation (Corrección 1)', () => {
  const dims = [
    [8, 7],
    [8, 8],
    [9, 9],
    [9, 10],
    [10, 6],
    [10, 12],
    [11, 11],
    [11, 12],
    [12, 10],
    [12, 11],
    [13, 9],
  ] as const

  it('rhombus width mirrors vertically: width(i) === width(n-1-i)', () => {
    for (const [cols, rows] of dims) {
      const shape = createShapedRowShape('rhombus', cols, rows)
      for (let i = 0; i < rows; i++) expect(shape[i].length).toBe(shape[rows - 1 - i].length)
    }
  })

  it('every row is centered on the same physical axis: left margin equals right margin, with at most half a bead of unavoidable slack per row', () => {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        for (let r = 0; r < rows; r++) {
          const { offset, length } = shape[r]
          const left = physicalLeft(r, offset)
          const right = physicalRight(r, offset, length, cols)
          // A half-bead rounding slack on `offset` shows up as at most a
          // full bead of left/right margin difference (dev = 2 * slack) —
          // never more, since idealOffset is rounded to the nearest integer.
          expect(Math.abs(left - right)).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })

  it('a floating-point edge case that previously broke the vertical width mirror (cols=10, rows=13) is now exact', () => {
    const shape = createShapedRowShape('rhombus', 10, 13)
    for (let i = 0; i < 13; i++) expect(shape[i].length).toBe(shape[12 - i].length)
  })
})

/** Physical center of a row, in bead units — the row's own offset plus brick's 0.5 stagger plus half its own width. */
function physicalCenter(row: number, offset: number, length: number): number {
  return offset + (isOddIndex(row) ? 0.5 : 0) + length / 2
}

describe('createShapedRowShape — physical-axis spine (regression, no serpentine)', () => {
  // Every dimension the QA report named: 12x10 and 10x12 have an EVEN row
  // count (every mirror pair has mismatched brick parity — exact center
  // equality is mathematically impossible there, see resolveOffsets' own
  // doc comment); 11x9, 9x9, 13x7 have an ODD row count (every mirror pair
  // shares parity, so exact equality is not just possible but guaranteed).
  const dims = [
    [12, 10],
    [11, 9],
    [9, 9],
    [10, 12],
    [13, 7],
  ] as const
  const oddRowDims = dims.filter(([, rows]) => rows % 2 === 1)

  it('odd row counts: a rhombus mirror pair always lands on the exact same physical center', () => {
    for (const [cols, rows] of oddRowDims) {
      const shape = createShapedRowShape('rhombus', cols, rows)
      for (let r = 0; r < rows; r++) {
        const mirror = rows - 1 - r
        expect(physicalCenter(r, shape[r].offset, shape[r].length)).toBeCloseTo(
          physicalCenter(mirror, shape[mirror].offset, shape[mirror].length),
          9,
        )
      }
    }
  })

  it('no row ever deviates from the pattern axis (cols/2) by more than half a bead', () => {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        shape.forEach((row, r) => {
          const dev = Math.abs(physicalCenter(r, row.offset, row.length) - cols / 2)
          expect(dev).toBeLessThanOrEqual(0.5 + 1e-9)
        })
      }
    }
  })

  it('the physical center never swings more than half a bead across the whole piece (the QA-reported serpentine)', () => {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        const centers = shape.map((row, r) => physicalCenter(r, row.offset, row.length))
        const range = Math.max(...centers) - Math.min(...centers)
        expect(range).toBeLessThanOrEqual(0.5 + 1e-9)
      }
    }
  })

  it('regression: rhombus 12x10 no longer zigzags a full bead (11,12,12,13,11,12,12,13,11,12 → range ≤ half a bead)', () => {
    const shape = createShapedRowShape('rhombus', 12, 10)
    expect(shape.map((s) => s.length)).toEqual([1, 3, 6, 8, 11, 11, 8, 6, 3, 1])
    // The old (buggy) sequential tie-break gave offsets [5,4,3,2,0,0,2,3,4,5],
    // whose centers zigzagged between 11 and 13 (half-bead units). The fix's
    // stateless Math.round instead always breaks a tie the same direction.
    expect(shape.map((s) => s.offset)).toEqual([6, 4, 3, 2, 1, 0, 2, 3, 5, 5])
    const centersX2 = shape.map((row, r) => 2 * physicalCenter(r, row.offset, row.length))
    expect(Math.max(...centersX2) - Math.min(...centersX2)).toBeLessThanOrEqual(1)
  })
})
