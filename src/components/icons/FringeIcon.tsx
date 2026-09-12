/**
 * "Flecos": the row the strands hang from, and the strands themselves in the
 * cascade a real fringe makes — longest in the middle, shortest at the edges.
 * Beads are filled rather than outlined here: at the size this is shown (a
 * chip on a phone, a panel heading) a 3px outlined bead is a smudge, while a
 * solid one still reads as a bead.
 */
export function FringeIcon({ size = 18 }: { size?: number }) {
  /** Beads hanging from each strand, edge to centre and back — the V of a finished fringe. */
  const strands = [1, 2, 3, 4, 3, 2, 1]
  const firstX = 3.6
  const stepX = 2.8
  const topY = 6.2
  const stepY = 3.1
  const bead = { w: 2.2, h: 2.4, r: 0.7 }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* The base row the fringe hangs from. */}
      <rect x="2.6" y={topY - 1.6} width="18.8" height="3.2" rx="1.4" />
      {strands.map((count, i) => {
        const x = firstX + i * stepX + 9 - (strands.length * stepX) / 2 + 0.2
        return (
          <g key={i}>
            {/* The thread, behind its beads. */}
            <rect x={x + bead.w / 2 - 0.35} y={topY} width="0.7" height={count * stepY} rx="0.35" />
            {Array.from({ length: count }).map((_, d) => (
              <rect key={d} x={x} y={topY + 1.6 + d * stepY} width={bead.w} height={bead.h} rx={bead.r} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
