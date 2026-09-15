import type { BrickDrop } from '@/engine/types'

/**
 * The tip of a brick earring woven 1-drop, 2-drop or 3-drop: stacks of one,
 * two or three rows that grow a bead at a time, each stack half a bead over
 * from the next. 2-drop and 3-drop start from two columns, as the app builds
 * them. Filled beads, like `ShapeIcon`.
 */
export function BrickDropIcon({ drop, size = 40 }: { drop: BrickDrop; size?: number }) {
  const widths = drop === 1 ? [1, 2, 3, 4] : [2, 3]
  const bead = { w: 7.4, r: 1.6 }
  const stepX = 8.2
  const rows = widths.flatMap((w) => Array.from({ length: drop }, () => w))
  const stepY = Math.min(7, 37 / rows.length)
  const beadH = stepY - 0.9
  const topY = 20 - (rows.length * stepY - 0.9) / 2
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      {rows.map((count, r) => {
        const startX = 20 - (count * stepX - (stepX - bead.w)) / 2
        return Array.from({ length: count }).map((_, c) => (
          <rect key={`${r}-${c}`} x={startX + c * stepX} y={topY + r * stepY} width={bead.w} height={beadH} rx={bead.r} />
        ))
      })}
    </svg>
  )
}
