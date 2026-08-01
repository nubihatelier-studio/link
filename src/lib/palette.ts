import type { ColorMap } from '@/engine/types'
import { parseCellKey } from '@/engine/cellKey'

export interface PaletteEntry {
  hex: string
  count: number
}

/**
 * Raw "which colors are on the grid, and how many beads of each" — used where
 * only the color set matters (seeding the editor's slots, the loop panel's
 * swatches). It does NOT decide letters and doesn't know about them: labels
 * come from `engine/letters.ts#assignLetters`, which orders colors by first
 * use along the weave and is the only place that hands out A, B, C.
 *
 * `loopBeads` (see `engine/loop.ts`) folds a woven hanging loop's beads into
 * the materials count — merged into an existing entry if the loop reuses one
 * of the pattern's own colors, or its own new entry otherwise — so the
 * materials list, its DB-code letters, and the pattern's total always
 * account for the loop the same way they already do for the fringe (whose
 * bead colors live directly in `cells` and so are counted for free). Absent
 * or a metal loop (0 beads) leaves this identical to the cells-only count.
 */
export function paletteFromCells(cells: ColorMap, loopBeads?: { color: string; count: number }): PaletteEntry[] {
  const counts = new Map<string, number>()
  for (const hex of Object.values(cells)) {
    if (!hex) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  if (loopBeads && loopBeads.count > 0) {
    counts.set(loopBeads.color, (counts.get(loopBeads.color) ?? 0) + loopBeads.count)
  }
  return Array.from(counts.entries())
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Repaints every cell currently `fromHex` to `toHex` — the shared mechanism
 * behind both "fusionar colores" (merge into an existing palette color) and
 * "reemplazar en todo el patrón" (recolor to an arbitrary new hex): the only
 * difference between the two is where the caller sources `toHex` from.
 */
export function replaceColorInCells(cells: ColorMap, fromHex: string, toHex: string): ColorMap {
  if (fromHex === toHex) return cells
  const next: ColorMap = {}
  for (const [key, hex] of Object.entries(cells)) {
    next[key] = hex === fromHex ? toHex : hex
  }
  return next
}

/**
 * Swaps every cell of `hexA` with `hexB` and vice versa, in one pass — doing
 * this as two sequential `replaceColorInCells` calls would collapse both
 * colors into one, since the first call's output cells would already be
 * indistinguishable from the ones the second call is supposed to touch.
 */
export function swapColorsInCells(cells: ColorMap, hexA: string, hexB: string): ColorMap {
  if (hexA === hexB) return cells
  const next: ColorMap = {}
  for (const [key, hex] of Object.entries(cells)) {
    next[key] = hex === hexA ? hexB : hex === hexB ? hexA : hex
  }
  return next
}

export interface ColorSelection {
  rect: { r0: number; c0: number; r1: number; c1: number }
  /** Exact "row,col" keys of every cell painted `hex` — the rect above is only their bounding box. */
  mask: Set<string>
}

/**
 * Bounding box + exact cell-key set of every cell currently painted `hex` —
 * "seleccionar todas las mostacillas de este color" almost never forms a
 * clean rectangle, so callers that only understand rectangular selections
 * (erase, copy) need the mask to know which cells inside the box are
 * actually part of the selection. Null when the color isn't on the grid.
 */
export function selectionForColor(cells: ColorMap, hex: string): ColorSelection | null {
  let r0 = Infinity
  let c0 = Infinity
  let r1 = -Infinity
  let c1 = -Infinity
  const mask = new Set<string>()
  for (const [key, cellHex] of Object.entries(cells)) {
    if (cellHex !== hex) continue
    const { row, col } = parseCellKey(key)
    mask.add(key)
    if (row < r0) r0 = row
    if (row > r1) r1 = row
    if (col < c0) c0 = col
    if (col > c1) c1 = col
  }
  if (mask.size === 0) return null
  return { rect: { r0, c0, r1, c1 }, mask }
}
