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
