import type { ColorMap } from '@/engine/types'

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
