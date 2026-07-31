import type { LoopData } from './types'

/** Typical size for a hanging bead loop — enough beads to form a small, sturdy ring. */
export const DEFAULT_LOOP_BEAD_COUNT = 8
export const MIN_LOOP_BEAD_COUNT = 3
export const MAX_LOOP_BEAD_COUNT = 30
export const DEFAULT_LOOP_COLOR = '#1c1c1e'

/** Bead count contributing to totals/materials — 0 for `'metal'` (no beads) or no loop at all. */
export function loopBeadCount(loop: LoopData | undefined): number {
  return loop?.variant === 'woven' ? loop.beadCount : 0
}

/**
 * How much extra height (in bead-units, same scale as `physicalSizeMm`'s
 * `rows`) a woven loop's ring adds above the body — modeled as a closed ring
 * of `count` beads strung one next to the other (see `loopBeadOffsets`, the
 * render-side counterpart built from this exact same figure): a circle of
 * radius R has circumference 2πR, and spacing `count` beads about one
 * bead-unit apart around it needs a circumference of ≈ `count`, so
 * R = count / 2π and the ring's overall height (its diameter) is count / π.
 * This is an illustrative estimate — a real beaded loop's exact size varies
 * with bead shape and thread tension — not a precise physical model.
 */
export function loopHeightUnits(beadCount: number): number {
  if (beadCount <= 0) return 0
  return beadCount / Math.PI
}

/**
 * Vertical room (bead-units) a `'metal'` loop's discreet indicator needs above
 * the body — a fixed, small allowance rather than a measurement: the actual
 * jump ring is a bought finding whose size we don't model, so it contributes
 * nothing to `physicalSizeMm` (see `loopBeadCount`, which is 0 for metal) and
 * only reserves enough canvas/page space for the little outlined ring drawn
 * in its place.
 */
export const METAL_LOOP_INDICATOR_UNITS = 1.4

/**
 * Vertical room a loop needs above the body when *drawing* it — the woven
 * ring's real arch height, or the flat allowance for the metal indicator.
 * Kept apart from `loopHeightUnits` on purpose: that one feeds the physical
 * size of the finished piece (beads only), this one feeds layout.
 */
export function loopReserveUnits(loop: LoopData | undefined): number {
  if (!loop) return 0
  return loop.variant === 'woven' ? loopHeightUnits(loop.beadCount) : METAL_LOOP_INDICATOR_UNITS
}

/**
 * Ensures a loop always has valid, in-range values — patterns saved before
 * this feature existed have no `loop` at all (treated as "no loop", same
 * convention as `engine/fringe.ts#normalizeFringe`/`engine/shape.ts#normalizeRowShape`),
 * so this only clamps an *existing* loop's bead count back into range (e.g.
 * if `MAX_LOOP_BEAD_COUNT` is ever lowered) — it never invents a loop that
 * wasn't there.
 */
export function normalizeLoop(loop: LoopData | undefined): LoopData | undefined {
  if (!loop) return undefined
  if (loop.variant === 'metal') return { variant: 'metal', beadCount: 0, color: loop.color }
  return {
    variant: 'woven',
    beadCount: Math.max(MIN_LOOP_BEAD_COUNT, Math.min(MAX_LOOP_BEAD_COUNT, Math.round(loop.beadCount))),
    color: loop.color,
  }
}

export interface LoopBeadOffset {
  dx: number
  dy: number
}

/**
 * Bead offsets (bead-units, relative to the body's top-tip anchor point) for
 * a woven loop's ring: a closed circle of `count` beads resting *on* the
 * anchor — its lowest point touches the body's top edge (`dy = 0`) and its
 * center sits one radius above it, so the whole ring occupies exactly the
 * `loopHeightUnits(count)` of vertical room reserved for it. Beads are laid
 * out counter-clockwise from the bottom of the circle. "Up" is negative `dy`,
 * matching `cellPosition`'s own convention.
 */
export function loopBeadOffsets(count: number): LoopBeadOffset[] {
  if (count <= 0) return []
  const radius = loopHeightUnits(count) / 2
  const offsets: LoopBeadOffset[] = []
  for (let i = 0; i < count; i++) {
    // Start at the bottom of the circle (the bead touching the body) and go around.
    const angle = Math.PI / 2 + (i / count) * Math.PI * 2
    offsets.push({ dx: radius * Math.cos(angle), dy: -radius + radius * Math.sin(angle) })
  }
  return offsets
}
