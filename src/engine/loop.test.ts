import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOOP_BEAD_COUNT,
  loopBeadCount,
  loopBeadOffsets,
  loopHeightUnits,
  loopReserveUnits,
  MAX_LOOP_BEAD_COUNT,
  METAL_LOOP_INDICATOR_UNITS,
  MIN_LOOP_BEAD_COUNT,
  normalizeLoop,
} from './loop'

describe('loopBeadCount', () => {
  it('is 0 when there is no loop at all', () => {
    expect(loopBeadCount(undefined)).toBe(0)
  })

  it('is 0 for a metal loop (no beads to weave)', () => {
    expect(loopBeadCount({ variant: 'metal', beadCount: 0, color: '#000' })).toBe(0)
  })

  it('is the bead count for a woven loop', () => {
    expect(loopBeadCount({ variant: 'woven', beadCount: DEFAULT_LOOP_BEAD_COUNT, color: '#c9a227' })).toBe(
      DEFAULT_LOOP_BEAD_COUNT,
    )
  })
})

describe('loopHeightUnits', () => {
  it('is 0 for 0 (or fewer) beads', () => {
    expect(loopHeightUnits(0)).toBe(0)
    expect(loopHeightUnits(-3)).toBe(0)
  })

  it('grows with bead count (a bigger ring is taller)', () => {
    expect(loopHeightUnits(12)).toBeGreaterThan(loopHeightUnits(8))
  })
})

describe('loopReserveUnits — drawing room, not physical size', () => {
  it('is 0 with no loop', () => {
    expect(loopReserveUnits(undefined)).toBe(0)
  })

  it('matches the arch height for a woven loop', () => {
    expect(loopReserveUnits({ variant: 'woven', beadCount: 12, color: '#c9a227' })).toBeCloseTo(loopHeightUnits(12), 10)
  })

  it('is the fixed indicator allowance for a metal loop, even though it adds no beads', () => {
    const metal = { variant: 'metal' as const, beadCount: 0, color: '#c9a227' }
    expect(loopReserveUnits(metal)).toBe(METAL_LOOP_INDICATOR_UNITS)
    expect(loopBeadCount(metal)).toBe(0)
  })
})

describe('normalizeLoop', () => {
  it('undefined stays undefined — legacy patterns load with no loop', () => {
    expect(normalizeLoop(undefined)).toBeUndefined()
  })

  it('clamps a woven loop\'s bead count into [MIN, MAX]', () => {
    expect(normalizeLoop({ variant: 'woven', beadCount: 1, color: '#111' })!.beadCount).toBe(MIN_LOOP_BEAD_COUNT)
    expect(normalizeLoop({ variant: 'woven', beadCount: 999, color: '#111' })!.beadCount).toBe(MAX_LOOP_BEAD_COUNT)
    expect(normalizeLoop({ variant: 'woven', beadCount: 8, color: '#111' })!.beadCount).toBe(8)
  })

  it('a metal loop always normalizes to beadCount 0 regardless of stray input', () => {
    expect(normalizeLoop({ variant: 'metal', beadCount: 50, color: '#111' })).toEqual({
      variant: 'metal',
      beadCount: 0,
      color: '#111',
    })
  })
})

describe('loopBeadOffsets — closed ring resting on the anchor', () => {
  it('is empty for 0 beads', () => {
    expect(loopBeadOffsets(0)).toEqual([])
  })

  it('returns exactly one offset per bead', () => {
    expect(loopBeadOffsets(8)).toHaveLength(8)
    expect(loopBeadOffsets(3)).toHaveLength(3)
  })

  it('rests on the anchor: the lowest bead touches dy = 0 and the rest are above it', () => {
    const offsets = loopBeadOffsets(9)
    // "up" is negative dy, matching cellPosition's own convention.
    expect(Math.max(...offsets.map((o) => o.dy))).toBeCloseTo(0, 10)
    expect(offsets.filter((o) => o.dy < 0).length).toBe(offsets.length - 1)
  })

  it('occupies exactly the height reserved for it — no more, no less', () => {
    const count = 12
    const offsets = loopBeadOffsets(count)
    const top = Math.min(...offsets.map((o) => o.dy))
    const bottom = Math.max(...offsets.map((o) => o.dy))
    expect(bottom - top).toBeCloseTo(loopHeightUnits(count), 10)
  })

  it('every bead sits on the ring itself, centered one radius above the anchor', () => {
    const count = 12
    const radius = loopHeightUnits(count) / 2
    for (const { dx, dy } of loopBeadOffsets(count)) {
      expect(Math.hypot(dx, dy + radius)).toBeCloseTo(radius, 10)
    }
  })

  it('is as wide as it is tall — a ring, not a flattened arch', () => {
    const offsets = loopBeadOffsets(24)
    const width = Math.max(...offsets.map((o) => o.dx)) - Math.min(...offsets.map((o) => o.dx))
    const height = Math.max(...offsets.map((o) => o.dy)) - Math.min(...offsets.map((o) => o.dy))
    expect(width).toBeCloseTo(height, 1)
  })

  it('a single bead sits centered, right on the anchor', () => {
    const offsets = loopBeadOffsets(1)
    expect(offsets).toHaveLength(1)
    expect(offsets[0].dx).toBeCloseTo(0, 10)
    expect(offsets[0].dy).toBeCloseTo(0, 10)
  })
})
