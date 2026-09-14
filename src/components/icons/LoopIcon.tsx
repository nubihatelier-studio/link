/**
 * "Argolla de enganche": a ring of beads sitting on the top tip of the piece,
 * which is what the panel adds — the loop an earring hook goes through. The
 * ring's beads are round (a ring is seen from the side, bead holes and all)
 * and the tip below is the same filled brick bead as `ShapeIcon`.
 */
export function LoopIcon({ size = 18 }: { size?: number }) {
  const ring = { cx: 12, cy: 6.4, radius: 4.8, beads: 11, beadR: 1.25 }
  /**
   * The piece's tip under the ring, one bead wider per row. Starting at two
   * beads, not one: a one-bead neck under a round ring read as a little
   * person at chip size.
   */
  const tip = [2, 3, 4]
  const bead = { w: 2.9, h: 2.6, r: 0.8 }
  const stepX = 3.4
  const tipTop = ring.cy + ring.radius + ring.beadR + 0.6
  const stepY = 3.1
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {Array.from({ length: ring.beads }).map((_, i) => {
        const angle = (i / ring.beads) * Math.PI * 2 + Math.PI / 2
        return (
          <circle
            key={`ring-${i}`}
            cx={ring.cx + Math.cos(angle) * ring.radius}
            cy={ring.cy + Math.sin(angle) * ring.radius}
            r={ring.beadR}
          />
        )
      })}
      {tip.map((count, r) => {
        const startX = 12 - (count * stepX - (stepX - bead.w)) / 2
        return Array.from({ length: count }).map((_, c) => (
          <rect key={`tip-${r}-${c}`} x={startX + c * stepX} y={tipTop + r * stepY} width={bead.w} height={bead.h} rx={bead.r} />
        ))
      })}
    </svg>
  )
}
