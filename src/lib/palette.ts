import type { ColorMap } from '@/engine/types'
import { parseCellKey } from '@/engine/cellKey'

export interface PaletteEntry {
  hex: string
  count: number
}

export function paletteFromCells(cells: ColorMap): PaletteEntry[] {
  const counts = new Map<string, number>()
  for (const hex of Object.values(cells)) {
    if (!hex) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
}

/** A, B, ... Z, AA, AB, ... — stable per-pattern letter code for a palette index. */
export function letterForIndex(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
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
