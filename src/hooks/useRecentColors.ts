import { useMemo } from 'react'
import { paletteFromCells } from '@/lib/palette'
import { usePatternsStore } from '@/store/patternsStore'

/**
 * Colors from the weaver's other patterns, most recently edited first — the
 * blue she keeps coming back to shouldn't have to be found again on the tone
 * grid. Leaves out `exclude` (what's already in this pattern's tray).
 */
export function useRecentColors(currentId: string | null, exclude: (string | null)[], limit = 10): string[] {
  const patterns = usePatternsStore((s) => s.patterns)
  return useMemo(() => {
    const skip = new Set(exclude.filter((h): h is string => Boolean(h)).map((h) => h.toLowerCase()))
    const out: string[] = []
    const others = Object.values(patterns)
      .filter((p) => p.id !== currentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    for (const doc of others) {
      const colors = [...(doc.palette ?? []), ...paletteFromCells(doc.cells).map((e) => e.hex)]
      for (const hex of colors) {
        if (!hex || skip.has(hex.toLowerCase())) continue
        skip.add(hex.toLowerCase())
        out.push(hex)
        if (out.length >= limit) return out
      }
    }
    return out
  }, [patterns, currentId, exclude, limit])
}
