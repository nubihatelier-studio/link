import type { BeadTypeDef, Technique } from '@/engine/types'
import { beadCount } from '@/engine/geometry'

/**
 * Rough thread-consumption rule of thumb for single-needle bead weaving —
 * there's no exact physical model (tension, knot count, and thread waste per
 * weaver vary too much), so this is deliberately an *estimate*, flagged as
 * such in the UI/PDF, not a precise spec:
 *
 * - Loom: the weft thread passes through each bead once per row (the warp
 *   threads are separate and pre-cut, not counted here).
 * - Peyote/brick: each bead is threaded through roughly twice as the
 *   interlocking stitch progresses row over row.
 *
 * A 30% safety margin is added on top for tension, finishing tails and knots.
 */
const THREAD_PASSES_PER_BEAD: Record<Technique, number> = {
  loom: 1,
  peyote: 2,
  brick: 2,
}
const THREAD_SAFETY_MARGIN = 1.3

/** Estimated thread length, in meters, to weave a full pattern. See module doc for the formula's assumptions. */
export function estimateThreadMeters(technique: Technique, cols: number, rows: number, beadWidthMm: number): number {
  const total = beadCount(technique, cols, rows)
  const mm = total * THREAD_PASSES_PER_BEAD[technique] * beadWidthMm * THREAD_SAFETY_MARGIN
  return mm / 1000
}

/**
 * Suggested beading needle size by bead width — English needle sizes run
 * inverse to hole size (a bigger number is a thinner, more flexible needle).
 * Miyuki Delica 11/0 (~1.6mm) and Rocalla 11/0 (~2.1mm) both comfortably fit
 * a #12 needle; a #10 is offered as the sturdier alternative for wider beads.
 */
export function suggestedNeedle(bead: BeadTypeDef): string {
  if (bead.widthMm <= 1.8) return 'Aguja para bead N.º 12 o 13'
  if (bead.widthMm <= 2.4) return 'Aguja para bead N.º 10 o 12'
  return 'Aguja para bead N.º 10'
}
