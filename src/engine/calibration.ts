import type { Technique } from './types'

/**
 * Thread & tension correction — the gap between "sum of the beads' own
 * dimensions" and a finished piece measured with a ruler.
 *
 * A bead's catalog dimensions describe the bead *alone*. In a woven piece the
 * thread running through every bead, plus how tightly the weaver pulls it,
 * spaces consecutive ROWS slightly further apart than the bare bead pitch.
 * No manufacturer spec sheet publishes this number — Miyuki's included — so
 * it can only be obtained by weaving a piece and measuring it. Every value
 * here is therefore either a real measurement or an explicitly-flagged 1
 * placeholder; see `WEAVE_THREAD_FACTOR` below.
 *
 * Applied to the ROW pitch only, never to the width: across a row the beads
 * sit hole-to-hole, touching, so the thread adds no measurable width. Down a
 * column each row hangs off the previous row's thread, and that's where the
 * slack accumulates.
 *
 * ## Reference sample (the only calibrated combination so far)
 *
 * peyote · Miyuki Delica 11/0 · 6 columns × 60 rows → **8.0 × 102 mm**,
 * measured by hand on a real bracelet.
 *
 * Bare-bead theory (after fixing the axis mapping and the double-counted
 * interlock, see `geometry.ts`) gives:
 *   - width  6 × 1.3 mm = 7.8 mm  → 2.5% under the real 8.0 mm
 *   - height 60 × 1.6 mm = 96 mm  → 6% under the real 102 mm
 *
 * The width is within hand-measuring error, so no width correction is
 * applied. The height gap is thread and tension: 102 / 96 = **1.0625**.
 *
 * Re-calibrating? Weave that same 6 × 60 swatch, measure it, and divide the
 * measured length by `rows × the bead's vertical dimension`.
 */
export const CALIBRATION_SAMPLE = {
  technique: 'peyote' as Technique,
  beadTypeId: 'miyuki-delica-11',
  cols: 6,
  rows: 60,
  measuredWidthMm: 8.0,
  measuredHeightMm: 102,
} as const

/**
 * Row-pitch multiplier per (technique × bead type). Keyed by
 * `` `${technique}:${beadTypeId}` `` so a factor is never silently reused
 * across bead sizes — a Delica 11/0 and a Rocalla 11/0 take up thread very
 * differently even at the "same" nominal size.
 *
 * A missing entry falls back to `THEORETICAL_FACTOR` (exactly 1, i.e. bare
 * bead dimensions with no correction). That fallback is deliberate: an
 * uncalibrated combination reports honest bead-only geometry rather than a
 * number extrapolated from a different technique.
 */
const WEAVE_THREAD_FACTOR: Record<string, number> = {
  // Measured on a real piece — see CALIBRATION_SAMPLE above.
  'peyote:miyuki-delica-11': 102 / 96,
}

/** No physical sample measured: report the bare bead geometry, uncorrected. */
export const THEORETICAL_FACTOR = 1

function factorKey(technique: Technique, beadTypeId: string): string {
  return `${technique}:${beadTypeId}`
}

/**
 * Row-pitch multiplier for this technique and bead type — `1` for any
 * combination that hasn't been calibrated against a physical piece.
 */
export function weaveThreadFactor(technique: Technique, beadTypeId: string): number {
  return WEAVE_THREAD_FACTOR[factorKey(technique, beadTypeId)] ?? THEORETICAL_FACTOR
}

/**
 * Whether this combination's factor comes from a measured piece. Useful for
 * tests and for any future UI that wants to flag an estimate as theoretical.
 */
export function isCalibrated(technique: Technique, beadTypeId: string): boolean {
  return factorKey(technique, beadTypeId) in WEAVE_THREAD_FACTOR
}
