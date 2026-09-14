/**
 * "Forma del cuerpo": brick rows growing a bead and shrinking a bead, the way
 * a shaped body is woven — which is exactly what the panel edits, one row at
 * a time. Each row sits half a bead over from the next, as brick does. Filled
 * beads, like `FringeIcon`, so it still reads at chip size.
 */
export function ShapeIcon({ size = 18 }: { size?: number }) {
  /** Beads per row, top to bottom: an increase to the widest row and a decrease back. */
  const rows = [2, 3, 4, 3, 2]
  const bead = { w: 3.6, h: 3.2, r: 1 }
  const stepX = 4.2
  const stepY = 4
  const topY = 12 - (rows.length * stepY - (stepY - bead.h)) / 2
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {rows.map((count, r) => {
        const startX = 12 - (count * stepX - (stepX - bead.w)) / 2
        return Array.from({ length: count }).map((_, c) => (
          <rect key={`${r}-${c}`} x={startX + c * stepX} y={topY + r * stepY} width={bead.w} height={bead.h} rx={bead.r} />
        ))
      })}
    </svg>
  )
}
