import { describe, expect, it } from 'vitest'
import { isOddIndex } from './geometry'
import {
  createRectangleRowShape,
  createShapedRowShape,
  isShapeCapable,
  maxRowWidth,
  normalizeRowShape,
  preferredRowsFor,
  recenterRowShape,
} from './shape'

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

describe('recenterRowShape — centering as an invariant, not an incremental calculation (Corrección 1)', () => {
  it('reproduces createShapedRowShape exactly when given a fresh preset\'s own widths — same algorithm, just exposed', () => {
    for (const preset of ['triangle', 'triangleInverted', 'rhombus'] as const) {
      for (const [cols, rows] of [
        [13, 7],
        [12, 10],
        [9, 9],
        [21, 8],
      ] as const) {
        const shape = createShapedRowShape(preset, cols, rows)
        const recentered = recenterRowShape(
          shape.map((row) => ({ offset: 0, length: row.length })),
          cols,
        )
        expect(recentered).toEqual(shape)
      }
    }
  })

  it('regression: inserting a row at the top 5 times in a row (the reported "romboide" bug) stays perfectly centered — matches generating the final size directly', () => {
    // Mirrors ShapePanel's "+ Agregar fila arriba": prepend a row 1 bead
    // narrower than the current first, then recenter everything from
    // scratch — never patch just the new row and leave the rest as-is,
    // since inserting shifts every existing row to a new absolute index,
    // flipping its brick parity (see recenterRowShape's doc comment).
    function addRowAtTop(rowShape: { offset: number; length: number }[], cols: number) {
      const oldFirst = rowShape[0]
      const length = Math.max(1, oldFirst.length - 1)
      return recenterRowShape([{ offset: 0, length }, ...rowShape], cols)
    }
    let rowShape = createShapedRowShape('triangle', 13, 7)
    for (let i = 0; i < 5; i++) {
      rowShape = addRowAtTop(rowShape, 13)
      // Never drifts out of bounds at any intermediate step, even before reaching the final size.
      rowShape.forEach((row) => {
        expect(row.offset).toBeGreaterThanOrEqual(0)
        expect(row.offset + row.length).toBeLessThanOrEqual(13)
      })
    }
    expect(rowShape).toEqual(createShapedRowShape('triangle', 13, 12))
    // The specific complaint: row 1 should NOT be off in columns 9-10 (offset 8) — it must be centered.
    expect(rowShape[0]).not.toEqual({ offset: 8, length: 2 })
  })

  it('regression: removing rows from the top repeatedly also stays centered (no incremental patch, same recompute)', () => {
    function removeRowAtTop(rowShape: { offset: number; length: number }[], cols: number) {
      return recenterRowShape(rowShape.slice(1), cols)
    }
    let rowShape = createShapedRowShape('rhombus', 13, 13)
    for (let i = 0; i < 4; i++) rowShape = removeRowAtTop(rowShape, 13)
    expect(rowShape).toEqual(recenterRowShape(rowShape, 13)) // already a fixed point — recentering again changes nothing
    rowShape.forEach((row) => {
      expect(row.offset).toBeGreaterThanOrEqual(0)
      expect(row.offset + row.length).toBeLessThanOrEqual(13)
    })
  })

  it('handles a manually-edited row shape with a width jump bigger than 1 bead between rows (no single parity-locked side exists) without going out of bounds', () => {
    const handEdited = [
      { offset: 5, length: 3 },
      { offset: 2, length: 9 }, // jumped from 3 to 9 beads — could never come from a single generator step
      { offset: 4, length: 5 },
    ]
    const recentered = recenterRowShape(handEdited, 13)
    expect(recentered.map((r) => r.length)).toEqual([3, 9, 5]) // widths are never touched, only offsets
    recentered.forEach((row) => {
      expect(row.offset).toBeGreaterThanOrEqual(0)
      expect(row.offset + row.length).toBeLessThanOrEqual(13)
    })
  })
})

describe('recenterRowShape + staggerPhase — insertion/removal keeps the whole silhouette centered (Corrección 1, Ronda I)', () => {
  interface Shaped {
    rowShape: { offset: number; length: number }[]
    staggerPhase: 0 | 1
  }

  /** Mirrors editorStore.ts's addRowAtTop exactly: prepend a narrower row, flip staggerPhase, recenter with the NEW phase. */
  function addRowAtTop(state: Shaped, cols: number): Shaped {
    const oldFirst = state.rowShape[0]
    const length = Math.max(1, oldFirst.length - 1)
    const staggerPhase: 0 | 1 = state.staggerPhase === 0 ? 1 : 0
    return { rowShape: recenterRowShape([{ offset: 0, length }, ...state.rowShape], cols, staggerPhase), staggerPhase }
  }

  /** Mirrors editorStore.ts's removeRowAtTop exactly. */
  function removeRowAtTop(state: Shaped, cols: number): Shaped {
    const staggerPhase: 0 | 1 = state.staggerPhase === 0 ? 1 : 0
    return { rowShape: recenterRowShape(state.rowShape.slice(1), cols, staggerPhase), staggerPhase }
  }

  function physicalLeft(row: number, offset: number, phase: 0 | 1): number {
    return offset + (isOddIndex(row + phase) ? 0.5 : 0)
  }

  /**
   * Asserts (a) every row centered within 0.5 bead of cols/2, and (b) no
   * row's physical edge ever falls outside [0, cols + 0.5] — the "+ 0.5" is
   * not a fudge factor, it's the technique's own physical reservation for
   * brick's stagger (see `geometry.ts#gridBoundsUnits`'s `extraX`): a row
   * landing on the "odd" stagger is legitimately shifted half a bead right,
   * same as every other odd row in a real brick-stitch chart, and the
   * canvas is already sized to fit that. Correcciones 1 and 2.
   */
  function assertCenteredAndBounded(state: Shaped, cols: number) {
    state.rowShape.forEach((row, r) => {
      const left = physicalLeft(r, row.offset, state.staggerPhase)
      const right = left + row.length
      expect(left).toBeGreaterThanOrEqual(-1e-9)
      expect(right).toBeLessThanOrEqual(cols + 0.5 + 1e-9)
      const center = left + row.length / 2
      expect(Math.abs(center - cols / 2)).toBeLessThanOrEqual(0.5 + 1e-9)
    })
  }

  const presetsAndCols: readonly (readonly ['triangle' | 'rhombus', number])[] = [
    ['triangle', 13],
    ['triangle', 12],
    ['rhombus', 13],
    ['rhombus', 12],
  ]

  // Row count uses `preferredRowsFor` — the same silent nudge ConfiguratorPage
  // applies when a preset is picked — so every starting silhouette here is
  // already correctly, symmetrically centered (H2/H3's own fix), and these
  // tests isolate exactly what Ronda I is responsible for: that inserting or
  // removing rows on top of an already-correct silhouette doesn't undo that.
  function initialState(preset: 'triangle' | 'rhombus', cols: number): Shaped {
    const rows = preferredRowsFor(preset, cols)
    return { rowShape: createShapedRowShape(preset, cols, rows), staggerPhase: 0 }
  }

  it.each(presetsAndCols)(
    '%s at %i cols stays centered and in-bounds through 1, 2, 5 and 10 additions on top',
    (preset, cols) => {
      let state = initialState(preset, cols)
      assertCenteredAndBounded(state, cols)
      let added = 0
      for (const checkpoint of [1, 2, 5, 10]) {
        while (added < checkpoint) {
          state = addRowAtTop(state, cols)
          added++
          assertCenteredAndBounded(state, cols)
        }
      }
    },
  )

  it.each(presetsAndCols)(
    '%s at %i cols: adding 10 rows then removing 10 rows returns exactly the original silhouette (round-trip idempotent)',
    (preset, cols) => {
      const initial = initialState(preset, cols)
      let state = initial
      for (let i = 0; i < 10; i++) state = addRowAtTop(state, cols)
      for (let i = 0; i < 10; i++) state = removeRowAtTop(state, cols)
      expect(state.staggerPhase).toBe(initial.staggerPhase)
      expect(state.rowShape).toEqual(initial.rowShape)
    },
  )

  it('regression fixture from the reported screenshot: 13 cols x 15 rows (triangle, 2 additions from 13x13) stays centered and in-bounds at every intermediate step', () => {
    let state: Shaped = { rowShape: createShapedRowShape('triangle', 13, 13), staggerPhase: 0 }
    assertCenteredAndBounded(state, 13)
    for (let i = 0; i < 2; i++) {
      state = addRowAtTop(state, 13)
      assertCenteredAndBounded(state, 13)
    }
    expect(state.rowShape).toHaveLength(15)
    // The widest row (13 beads, full grid width) must sit with its left edge
    // at exactly 0 — the exact overflow the user's screenshot showed fixed.
    const widest = state.rowShape[state.rowShape.length - 1]
    expect(widest.length).toBe(13)
    expect(physicalLeft(state.rowShape.length - 1, widest.offset, state.staggerPhase)).toBe(0)
  })

  it('without staggerPhase compensation (phase pinned to 0 throughout), the same insertion sequence WOULD overflow — proves the fix is load-bearing, not a no-op', () => {
    // Same as addRowAtTop above but never flips (or passes) staggerPhase —
    // reproduces the pre-Ronda-I behavior exactly, to guard against this
    // suite accidentally passing for reasons unrelated to the phase fix.
    function addRowAtTopNoPhase(rowShape: { offset: number; length: number }[], cols: number) {
      const oldFirst = rowShape[0]
      const length = Math.max(1, oldFirst.length - 1)
      return recenterRowShape([{ offset: 0, length }, ...rowShape], cols)
    }
    let rowShape = createShapedRowShape('triangle', 13, 13)
    rowShape = addRowAtTopNoPhase(rowShape, 13)
    const widest = rowShape[rowShape.length - 1]
    expect(widest.length).toBe(13)
    // Reproduces the exact bug: the full-width row's left edge overflows past 0.
    expect(physicalLeft(rowShape.length - 1, widest.offset, 0)).toBe(0.5)
  })
})

describe('Corrección 2 — never drawing outside the grid, across a wide matrix of dimensions and edit sequences', () => {
  interface Shaped {
    rowShape: { offset: number; length: number }[]
    staggerPhase: 0 | 1
  }

  function addRowAtTop(state: Shaped, cols: number): Shaped {
    const oldFirst = state.rowShape[0]
    const length = Math.max(1, oldFirst.length - 1)
    const staggerPhase: 0 | 1 = state.staggerPhase === 0 ? 1 : 0
    return { rowShape: recenterRowShape([{ offset: 0, length }, ...state.rowShape], cols, staggerPhase), staggerPhase }
  }

  function removeRowAtTop(state: Shaped, cols: number): Shaped {
    if (state.rowShape.length <= 1) return state
    const staggerPhase: 0 | 1 = state.staggerPhase === 0 ? 1 : 0
    return { rowShape: recenterRowShape(state.rowShape.slice(1), cols, staggerPhase), staggerPhase }
  }

  /** Mirrors editorStore.ts's growRowEdge: row count/phase unchanged, only that one row's width (+1 bead) changes before the whole shape is recentered. */
  function growRowEdge(state: Shaped, cols: number, row: number, edge: 'left' | 'right'): Shaped {
    const shape = state.rowShape[row]
    const next = edge === 'left' ? { offset: shape.offset - 1, length: shape.length + 1 } : { offset: shape.offset, length: shape.length + 1 }
    if (next.offset < 0 || next.offset + next.length > cols) return state
    const nextRowShape = [...state.rowShape]
    nextRowShape[row] = next
    return { rowShape: recenterRowShape(nextRowShape, cols, state.staggerPhase), staggerPhase: state.staggerPhase }
  }

  /** Mirrors editorStore.ts's shrinkRowEdge. */
  function shrinkRowEdge(state: Shaped, cols: number, row: number, edge: 'left' | 'right'): Shaped {
    const shape = state.rowShape[row]
    if (shape.length <= 1) return state
    const next = edge === 'left' ? { offset: shape.offset + 1, length: shape.length - 1 } : { offset: shape.offset, length: shape.length - 1 }
    const nextRowShape = [...state.rowShape]
    nextRowShape[row] = next
    return { rowShape: recenterRowShape(nextRowShape, cols, state.staggerPhase), staggerPhase: state.staggerPhase }
  }

  /** No row's physical edge — offset plus brick's own stagger for its (index + phase) parity — may ever fall outside [0, cols + 0.5], the technique's own canvas reservation (see `gridBoundsUnits`'s `extraX`). */
  function assertNeverOutsideGrid(state: Shaped, cols: number) {
    state.rowShape.forEach((row, r) => {
      const left = row.offset + (isOddIndex(r + state.staggerPhase) ? 0.5 : 0)
      expect(left).toBeGreaterThanOrEqual(-1e-9)
      expect(left + row.length).toBeLessThanOrEqual(cols + 0.5 + 1e-9)
    })
  }

  // A small deterministic PRNG (mulberry32) — reproducible across runs, no
  // external dependency, just enough to generate varied but stable sequences
  // of add/remove/grow/shrink operations per (preset, cols) combination.
  function mulberry32(seed: number) {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const dims: readonly (readonly ['triangle' | 'triangleInverted' | 'rhombus' | 'rectangle', number])[] = [
    ['triangle', 7],
    ['triangle', 8],
    ['triangle', 13],
    ['triangleInverted', 9],
    ['triangleInverted', 10],
    ['rhombus', 11],
    ['rhombus', 12],
    ['rectangle', 6],
  ]

  it.each(dims)('%s at %i cols never draws outside the grid across 60 randomized add/remove/grow/shrink steps', (preset, cols) => {
    const rows = preferredRowsFor(preset, cols)
    let state: Shaped = { rowShape: createShapedRowShape(preset, cols, rows), staggerPhase: 0 }
    assertNeverOutsideGrid(state, cols)
    const rand = mulberry32(cols * 1000 + preset.length)
    for (let step = 0; step < 60; step++) {
      const op = Math.floor(rand() * 4)
      const row = Math.floor(rand() * state.rowShape.length)
      const edge = rand() < 0.5 ? 'left' : 'right'
      if (op === 0) state = addRowAtTop(state, cols)
      else if (op === 1) state = removeRowAtTop(state, cols)
      else if (op === 2) state = growRowEdge(state, cols, row, edge)
      else state = shrinkRowEdge(state, cols, row, edge)
      assertNeverOutsideGrid(state, cols)
    }
  })
})

describe('preferredRowsFor — silently nudging even rows to odd for presets with a forced parity bias (Correcciones 2 y 3)', () => {
  it('rectangle and triangleInverted are never adjusted — they have no forced-parity endpoint', () => {
    expect(preferredRowsFor('rectangle', 16)).toBe(16)
    expect(preferredRowsFor('rectangle', 17)).toBe(17)
    expect(preferredRowsFor('triangleInverted', 16)).toBe(16)
    expect(preferredRowsFor('triangleInverted', 17)).toBe(17)
  })

  it('triangle and rhombus round an even count up by 1; an odd count is left alone', () => {
    expect(preferredRowsFor('triangle', 16)).toBe(17)
    expect(preferredRowsFor('triangle', 13)).toBe(13)
    expect(preferredRowsFor('rhombus', 16)).toBe(17)
    expect(preferredRowsFor('rhombus', 13)).toBe(13)
  })

  it('fixture: triangle 13x12 (the reported bug — all rows centered at 7.0 instead of 6.5) is exactly fixed by the adjustment', () => {
    const buggy = createShapedRowShape('triangle', 13, 12)
    buggy.forEach((row, r) => {
      const center = physicalLeft(r, row.offset) + row.length / 2
      expect(center).toBeCloseTo(7, 9) // documents the forced bias itself — see preferredRowsFor's doc comment
    })

    const fixedRows = preferredRowsFor('triangle', 12)
    expect(fixedRows).toBe(13)
    const fixed = createShapedRowShape('triangle', 13, fixedRows)
    fixed.forEach((row, r) => {
      const center = physicalLeft(r, row.offset) + row.length / 2
      expect(center).toBeCloseTo(6.5, 9)
      expect(center).toBeGreaterThanOrEqual(0)
      expect(row.offset).toBeGreaterThanOrEqual(0)
      expect(row.offset + row.length).toBeLessThanOrEqual(13)
    })
  })

  it('property: for triangle/rhombus, after applying preferredRowsFor no row\'s physical span ever exceeds [0, cols], across a wide even/odd dimension matrix', () => {
    for (const preset of ['triangle', 'rhombus'] as const) {
      for (let cols = 5; cols <= 21; cols += 2) {
        for (let rows = 4; rows <= cols + 2; rows++) {
          const adjusted = preferredRowsFor(preset, rows)
          const shape = createShapedRowShape(preset, cols, adjusted)
          shape.forEach((row, r) => {
            const left = physicalLeft(r, row.offset)
            const right = physicalRight(r, row.offset, row.length)
            expect(left).toBeGreaterThanOrEqual(-1e-9)
            expect(right).toBeLessThanOrEqual(cols + 1e-9)
          })
        }
      }
    }
  })

  it('rhombus: exact vertical symmetry (raw offset, not just length) once rows is odd — no plateau, no mismatched mirror pair', () => {
    for (let cols = 5; cols <= 21; cols += 2) {
      for (let rows = 4; rows <= 16; rows++) {
        const adjusted = preferredRowsFor('rhombus', rows)
        const shape = createShapedRowShape('rhombus', cols, adjusted)
        for (let r = 0; r < adjusted; r++) {
          const mirror = adjusted - 1 - r
          expect(shape[r].offset).toBe(shape[mirror].offset)
          expect(shape[r].length).toBe(shape[mirror].length)
        }
      }
    }
  })

  it('applying a preset again after the nudge is idempotent (rows is already odd, so it stays put)', () => {
    const once = preferredRowsFor('rhombus', 16)
    expect(preferredRowsFor('rhombus', once)).toBe(once)
  })
})
