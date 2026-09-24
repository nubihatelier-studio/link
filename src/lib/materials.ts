import type { BeadTypeDef, RowShape, Technique } from '@/engine/types'
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
  // El aro triangular se teje como peyote: el hilo pasa dos veces por cada
  // mostacilla a medida que las vueltas se traban entre sí.
  triangle: 2,
  peyote: 2,
  brick: 2,
}
/** A fringe strand's thread goes down through each bead, then back up the same beads — 2 passes regardless of the body's own technique. */
const FRINGE_THREAD_PASSES_PER_BEAD = 2
const THREAD_SAFETY_MARGIN = 1.3

/**
 * Estimated thread length, in meters, to weave a full pattern. See module
 * doc for the formula's assumptions. `fringeBeadCount` (see
 * `engine/fringe.ts#totalFringeBeadCount`) folds in the extra thread every
 * fringe strand needs.
 */
export function estimateThreadMeters(
  technique: Technique,
  cols: number,
  rows: number,
  beadWidthMm: number,
  fringeBeadCount = 0,
  rowShape?: RowShape[],
): number {
  const total = beadCount(technique, cols, rows, rowShape)
  const bodyMm = total * THREAD_PASSES_PER_BEAD[technique] * beadWidthMm
  const fringeMm = fringeBeadCount * FRINGE_THREAD_PASSES_PER_BEAD * beadWidthMm
  return ((bodyMm + fringeMm) * THREAD_SAFETY_MARGIN) / 1000
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

/** Vidrio de mostacilla (soda-lime), en g/mm³. */
const GLASS_DENSITY = 0.0025
/** Una mostacilla redonda no llena su cilindro: se le descuenta esto. */
const ROUND_SHAPE_FACTOR = 0.8

/**
 * Peso de una mostacilla, en gramos, estimado por su geometría: el cilindro
 * que ocupa, menos el agujero, por la densidad del vidrio.
 *
 * Es una estimación y se muestra como tal, pero calza con lo que se sabe:
 * una Miyuki Delica 11/0 da ~200 por gramo, que es la cifra que usan las
 * tiendas, y una rocalla 11/0 da ~125, dentro del rango habitual (110-120).
 * Se calcula en vez de anotarse a mano para que una mostacilla nueva en
 * `data/beadTypes.ts` traiga su peso sin que nadie lo busque.
 */
export function beadWeightG(bead: BeadTypeDef): number {
  const cilindro = (Math.PI / 4) * bead.widthMm ** 2 * bead.heightMm
  const cuerpo = bead.shape === 'round' ? cilindro * ROUND_SHAPE_FACTOR : cilindro
  const agujero = (Math.PI / 4) * bead.holeMm ** 2 * bead.heightMm
  return Math.max(0, cuerpo - agujero) * GLASS_DENSITY
}

/** Cuántas mostacillas trae un gramo — como lo vende la tienda. */
export function beadsPerGram(bead: BeadTypeDef): number {
  const peso = beadWeightG(bead)
  return peso > 0 ? 1 / peso : 0
}

/**
 * Gramos para tantas mostacillas, redondeados a la décima y con un piso de
 * 0,1: en una lista para comprar, "0 g" no le sirve a nadie.
 */
export function gramsForBeads(count: number, bead: BeadTypeDef): number {
  if (count <= 0) return 0
  return Math.max(0.1, Math.round(count * beadWeightG(bead) * 10) / 10)
}
