import { describe, expect, it } from 'vitest'
import { isOddIndex } from './geometry'
import { createRectangleRowShape, createShapedRowShape, isShapeCapable, maxRowWidth, normalizeRowShape } from './shape'

/** Physical left edge of a brick row, in bead units — the row's own index offset plus brick's per-row 0.5 stagger (see `geometry.ts#cellPosition`). */
function physicalLeft(row: number, offset: number): number {
  return offset + (isOddIndex(row) ? 0.5 : 0)
}
/** Physical right edge of a brick row, in bead units. */
function physicalRight(row: number, offset: number, length: number): number {
  return offset + length + (isOddIndex(row) ? 0.5 : 0)
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

describe('createShapedRowShape — basic silhouette per preset', () => {
  it('rectangle: every row full width, same as createRectangleRowShape', () => {
    expect(createShapedRowShape('rectangle', 5, 4)).toEqual(createRectangleRowShape(5, 4))
  })

  it('triangle: narrow top (1 bead), full-width bottom, centered', () => {
    // 4 cols needs exactly 4 rows to climb from 1 bead to full width at 1
    // bead/row (see shape.ts's module doc) — fewer rows would just land on a
    // flat top edge wider than 1, still valid but not what this test checks.
    const shape = createShapedRowShape('triangle', 4, 4)
    expect(shape[0]).toEqual({ offset: 2, length: 1 }) // top: 1 bead, centered
    expect(shape[3]).toEqual({ offset: 0, length: 4 }) // bottom: full width
    for (let i = 1; i < shape.length; i++) expect(shape[i].length).toBeGreaterThanOrEqual(shape[i - 1].length)
  })

  it('triangleInverted: full-width top, narrow bottom (1 bead), centered', () => {
    const shape = createShapedRowShape('triangleInverted', 4, 4)
    expect(shape[0]).toEqual({ offset: 0, length: 4 })
    expect(shape[3]).toEqual({ offset: 1, length: 1 })
    for (let i = 1; i < shape.length; i++) expect(shape[i].length).toBeLessThanOrEqual(shape[i - 1].length)
  })

  it('rhombus: narrow at both ends, widest at the middle row, centered', () => {
    const shape = createShapedRowShape('rhombus', 9, 5)
    expect(shape[0].length).toBe(1)
    expect(shape[4].length).toBe(1)
    // Middle row doesn't reach full width here: only 2 row-transitions from
    // tip to peak, and at most 1 bead of *total* width growth per row (see
    // the module doc in shape.ts), so the peak caps at 1+2=3, not the full 9.
    expect(shape[2]).toEqual({ offset: 3, length: 3 })
    expect(shape[1].length).toBeLessThan(shape[2].length)
    expect(shape[3].length).toBeLessThan(shape[2].length)
  })

  it('a single-row body does not divide by zero', () => {
    expect(createShapedRowShape('triangle', 5, 1)).toEqual([{ offset: 0, length: 5 }])
  })
})

describe('createShapedRowShape — 1 bead of total width change per row (Corrección 1, el fix del motor)', () => {
  // The exact dimension matrix from the bug report, plus the 13x7 fixture
  // the corrected hand-charted trapezoid used to prove the fix (widths
  // 7..13, both edges advancing exactly half a bead every row).
  const dims = [
    [13, 7],
    [12, 10],
    [13, 13],
    [11, 6],
    [9, 9],
    [10, 12],
    [21, 8],
  ] as const

  it('fixture: 13x7 triangle matches the hand-corrected trapezoid exactly — widths 7..13, both edges dead straight', () => {
    const shape = createShapedRowShape('triangle', 13, 7)
    expect(shape.map((s) => s.length)).toEqual([7, 8, 9, 10, 11, 12, 13])
    for (let r = 1; r < shape.length; r++) {
      expect(physicalLeft(r, shape[r].offset) - physicalLeft(r - 1, shape[r - 1].offset)).toBeCloseTo(-0.5, 9)
      expect(physicalRight(r, shape[r].offset, shape[r].length) - physicalRight(r - 1, shape[r - 1].offset, shape[r - 1].length)).toBeCloseTo(0.5, 9)
    }
  })

  it('(a) width never changes by more than 1 bead between consecutive rows (0 only at a rhombus\'s flat peak)', () => {
    for (const preset of ['rhombus', 'triangle', 'triangleInverted'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        for (let r = 1; r < rows; r++) expect(Math.abs(shape[r].length - shape[r - 1].length)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('(b) the physical edge-to-edge step between consecutive rows is always exactly half a bead — the test that catches the sawtooth', () => {
    for (const preset of ['rhombus', 'triangle', 'triangleInverted'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        for (let r = 1; r < rows; r++) {
          const widthDelta = shape[r].length - shape[r - 1].length
          const leftStep = physicalLeft(r, shape[r].offset) - physicalLeft(r - 1, shape[r - 1].offset)
          const rightStep = physicalRight(r, shape[r].offset, shape[r].length) - physicalRight(r - 1, shape[r - 1].offset, shape[r - 1].length)
          if (widthDelta === 0) {
            // A plateau: both edges shift together by brick's own natural
            // 0.5 stagger (same look a plain rectangle's rows always have),
            // never a lopsided sawtooth step.
            expect(leftStep).toBeCloseTo(rightStep, 9)
            expect(Math.abs(leftStep)).toBeCloseTo(0.5, 9)
          } else {
            expect(Math.abs(leftStep)).toBeCloseTo(0.5, 9)
            expect(Math.abs(rightStep)).toBeCloseTo(0.5, 9)
          }
        }
      }
    }
  })

  it('(c) horizontal mirror: every row stays centered on the pattern\'s physical axis (cols/2)', () => {
    for (const preset of ['rhombus', 'triangle', 'triangleInverted'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        shape.forEach((row, r) => {
          const center = physicalLeft(r, row.offset) + row.length / 2
          // Normally within half a bead. A very mismatched cols/rows pair can
          // force a choice between two anchors that are equally well-centered
          // near the tip but diverge later (a plateau's parity-locked 0.5
          // stagger can land on either side of the axis) — the algorithm
          // always keeps the choice with the smallest possible deviation, but
          // for some pairs (e.g. triangle 10x12: cols so small relative to
          // rows that 3 rows sit flat at 1 bead before the real taper starts)
          // that unavoidable minimum is a full bead, not half. See shape.ts's
          // `walkOffsets` for the exact mechanism, and `git log`/prior rounds
          // for the identical mathematical result already accepted for a
          // rhombus mirror pair under an odd/even rows mismatch.
          expect(Math.abs(center - cols / 2)).toBeLessThanOrEqual(1 + 1e-9)
        })
      }
    }
  })

  it('(d) rhombus: length always mirrors vertically; the raw offset mirrors exactly when rows is odd (mirror pair shares brick parity), and differs by exactly 1 when rows is even (parity mismatch makes exact equality impossible — same result already established for the previous generator)', () => {
    for (const [cols, rows] of dims) {
      const shape = createShapedRowShape('rhombus', cols, rows)
      const maxOffsetDiff = rows % 2 === 0 ? 1 : 0
      for (let r = 0; r < rows; r++) {
        const mirror = rows - 1 - r
        expect(shape[r].length).toBe(shape[mirror].length)
        expect(Math.abs(shape[r].offset - shape[mirror].offset)).toBeLessThanOrEqual(maxOffsetDiff)
      }
    }
  })

  it('every row stays in bounds: offset >= 0 and offset + length <= cols', () => {
    for (const preset of ['rhombus', 'triangle', 'triangleInverted'] as const) {
      for (const [cols, rows] of dims) {
        const shape = createShapedRowShape(preset, cols, rows)
        shape.forEach((row) => {
          expect(row.offset).toBeGreaterThanOrEqual(0)
          expect(row.offset + row.length).toBeLessThanOrEqual(cols)
        })
      }
    }
  })

  it('existing saved patterns are untouched: this only changes what new presets generate', () => {
    // normalizeRowShape (the function saved patterns are loaded through)
    // doesn't call createShapedRowShape at all — it only clamps whatever
    // rowShape was already saved, so this generator change can't retroactively
    // alter a pattern that already has one.
    const saved = [{ offset: 3, length: 6 }] // an arbitrary hand-edited row, e.g. from a pre-existing pattern
    expect(normalizeRowShape(saved, 12, 1)).toEqual(saved)
  })
})

describe('createShapedRowShape — a rhombus peak that falls short of cols still centers symmetrically', () => {
  it('regression: rhombus 13x10 (not enough rows to reach a 13-bead peak, at 1 bead of growth/row) caps at 5 beads, centered', () => {
    const shape = createShapedRowShape('rhombus', 13, 10)
    expect(shape.map((s) => s.length)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1])
    shape.forEach((row, r) => {
      const center = physicalLeft(r, row.offset) + row.length / 2
      expect(Math.abs(center - 13 / 2)).toBeLessThanOrEqual(1 + 1e-9)
    })
  })

  it('property: whenever the achievable peak falls short of cols, every row still stays within a bead of the pattern axis (never orphaned to one side)', () => {
    for (let cols = 8; cols <= 20; cols++) {
      for (let rows = 4; rows <= 14; rows++) {
        const shape = createShapedRowShape('rhombus', cols, rows)
        const maxWidth = Math.max(...shape.map((s) => s.length))
        if (maxWidth >= cols) continue // not a capped case
        shape.forEach((row, r) => {
          const center = physicalLeft(r, row.offset) + row.length / 2
          expect(Math.abs(center - cols / 2)).toBeLessThanOrEqual(1 + 1e-9)
        })
      }
    }
  })
})
