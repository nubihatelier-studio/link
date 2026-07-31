import type { Technique } from './types'

/**
 * Thread & tension correction — the gap between "sum of the beads' own
 * dimensions" and a finished piece measured with a ruler.
 *
 * A bead's catalog dimensions describe the bead *alone*. In a woven piece the
 * thread running through every bead, plus how tightly the weaver pulls it,
 * spaces consecutive ROWS slightly further apart than the bare bead pitch.
 * No manufacturer spec sheet publishes this number — Miyuki's included — so
 * it can only be obtained by weaving a piece and measuring it.
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
 * ## How to calibrate another combination
 *
 * Weave a swatch of known rows in that technique and bead, measure its
 * finished length, and divide by `rows × the bead's vertical dimension`
 * (which dimension is vertical depends on the technique — see
 * `geometry.ts#BEAD_AXIS_MAP`). Then move its row in the table below from
 * `theoretical()` to `measured()` with the sample's numbers.
 */
export const CALIBRATION_SAMPLE = {
  technique: 'peyote' as Technique,
  beadTypeId: 'miyuki-delica-11',
  cols: 6,
  rows: 60,
  measuredWidthMm: 8.0,
  measuredHeightMm: 102,
} as const

/** No physical sample measured: report the bare bead geometry, uncorrected. */
export const THEORETICAL_FACTOR = 1

export interface WeaveCalibration {
  /** Row-pitch multiplier. Exactly `THEORETICAL_FACTOR` unless measured. */
  factor: number
  /** `'measured'` means a real finished piece was put against a ruler. */
  source: 'measured' | 'theoretical'
  /** Free-text provenance — the sample for measured rows, what's missing for theoretical ones. */
  note: string
}

/** A combination calibrated against a real piece: the factor IS the measurement. */
function measured(measuredMm: number, theoreticalMm: number, note: string): WeaveCalibration {
  return { factor: measuredMm / theoreticalMm, source: 'measured', note }
}

/**
 * A combination nobody has woven and measured yet. The factor is exactly 1 on
 * purpose — an uncalibrated pair reports honest bead-only geometry instead of
 * a number extrapolated from a different technique or bead size, which would
 * look calibrated without being it.
 */
function theoretical(note: string): WeaveCalibration {
  return { factor: THEORETICAL_FACTOR, source: 'theoretical', note }
}

/**
 * Every (technique × bead type) the app can produce, in one place — the
 * single source of truth for how much thread and tension stretch a piece.
 *
 * Listed exhaustively rather than sparsely so the calibration debt is
 * visible: reading this table tells you at a glance which combinations rest
 * on a real measurement and which are still bare theory. `calibration.test.ts`
 * enforces that every catalog bead type appears here for all three
 * techniques, so adding a bead to `data/beadTypes.ts` fails the suite until
 * its rows are filled in — deliberately, so a new bead can't silently inherit
 * someone else's factor.
 *
 * Keyed by `` `${technique}:${beadTypeId}` `` — a Delica 11/0 and a Rocalla
 * 11/0 are nominally "the same size" but take up thread very differently, so
 * a factor is never shared across bead types.
 */
const WEAVE_THREAD_FACTOR: Record<string, WeaveCalibration> = {
  // ── Miyuki Delica 11/0 ────────────────────────────────────────────────
  'peyote:miyuki-delica-11': measured(
    CALIBRATION_SAMPLE.measuredHeightMm,
    CALIBRATION_SAMPLE.rows * 1.6,
    'Pulsera 6 × 60 medida a mano: 102 mm de largo contra 96 mm teóricos.',
  ),
  'loom:miyuki-delica-11': theoretical('Falta tejer y medir una muestra de loom en Delica 11/0.'),
  'brick:miyuki-delica-11': theoretical('Falta tejer y medir una muestra de brick en Delica 11/0.'),

  // ── Rocalla 11/0 ──────────────────────────────────────────────────────
  // Ninguna medida todavía. Además, la rocalla es redonda e irregular entre
  // unidades, así que probablemente necesite una muestra más larga que la
  // Delica para que el promedio por fila sea estable.
  'peyote:rocalla-11': theoretical('Falta tejer y medir una muestra de peyote en rocalla 11/0.'),
  'loom:rocalla-11': theoretical('Falta tejer y medir una muestra de loom en rocalla 11/0.'),
  'brick:rocalla-11': theoretical('Falta tejer y medir una muestra de brick en rocalla 11/0.'),
}

function factorKey(technique: Technique, beadTypeId: string): string {
  return `${technique}:${beadTypeId}`
}

/**
 * The calibration entry for this pair, or a theoretical fallback for a bead
 * type that isn't in the table yet. The fallback keeps the app working (and
 * honest) if a bead is added without its rows; the exhaustiveness test is
 * what makes sure that state doesn't survive review.
 */
export function weaveCalibration(technique: Technique, beadTypeId: string): WeaveCalibration {
  return (
    WEAVE_THREAD_FACTOR[factorKey(technique, beadTypeId)] ??
    theoretical(`Sin fila en la tabla de calibración para ${factorKey(technique, beadTypeId)}.`)
  )
}

/**
 * Row-pitch multiplier for this technique and bead type — exactly 1 for any
 * combination that hasn't been calibrated against a physical piece.
 */
export function weaveThreadFactor(technique: Technique, beadTypeId: string): number {
  return weaveCalibration(technique, beadTypeId).factor
}

/**
 * Whether this combination's size estimate rests on a measured piece. Kept
 * public so tests — and any future UI that wants to flag an estimate as
 * theoretical — read the same source of truth instead of hardcoding a list.
 */
export function isCalibrated(technique: Technique, beadTypeId: string): boolean {
  return weaveCalibration(technique, beadTypeId).source === 'measured'
}

/** Every key in the table, for tests and for a future "estado de calibración" view. */
export function calibrationKeys(): string[] {
  return Object.keys(WEAVE_THREAD_FACTOR)
}
