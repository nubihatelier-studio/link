import type { Technique } from '@/engine/types'

interface TechniqueIconProps {
  technique: Technique
  size?: number
  className?: string
}

/**
 * Per-technique bead icon, ported from the Lovable build (Peyote Weaver Pro)
 * and adapted to nubih's design tokens: outline beads drawn with
 * `stroke="currentColor"`, so they automatically pick up whatever text color
 * class the caller passes in (e.g. `text-accent-500` when active,
 * `text-text-muted` otherwise) instead of needing their own color prop.
 *
 * Each technique gets its own bead proportions (loom: square, peyote: tall
 * verticals, brick: wide horizontals) instead of reusing one generic square
 * grid, so the icon actually reads as "this technique" rather than a plain
 * checkerboard.
 */
export function TechniqueIcon({ technique, size = 40, className }: TechniqueIconProps) {
  switch (technique) {
    case 'loom':
      return <LoomIcon size={size} className={className} />
    case 'peyote':
      return <PeyoteIcon size={size} className={className} />
    case 'brick':
      return <BrickIcon size={size} className={className} />
  }
}

function Bead({ x, y, w, h, r = 2.2 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="none" stroke="currentColor" strokeWidth={1.6} />
  )
}

interface IconProps {
  size?: number
  className?: string
}

/** Loom — rejilla recta de mostacillas cuadradas alineadas. */
function LoomIcon({ size = 40, className }: IconProps) {
  const cols = 4
  const rows = 4
  const bw = 8
  const bh = 8
  const gap = 1.5
  const totalW = cols * bw + (cols - 1) * gap
  const totalH = rows * bh + (rows - 1) * gap
  const ox = (48 - totalW) / 2
  const oy = (48 - totalH) / 2
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <Bead key={`${r}-${c}`} x={ox + c * (bw + gap)} y={oy + r * (bh + gap)} w={bw} h={bh} />
        )),
      )}
    </svg>
  )
}

/** Peyote — beads verticales, columnas alternas desplazadas hacia abajo. */
function PeyoteIcon({ size = 40, className }: IconProps) {
  const cols = 5
  const rows = 3
  const bw = 6
  const bh = 10
  const gapX = 0.8
  const gapY = 0.8
  const stepX = bw + gapX
  const stepY = bh + gapY
  const totalW = cols * stepX - gapX
  const totalH = rows * stepY + bh / 2
  const ox = (48 - totalW) / 2
  const oy = (48 - totalH) / 2
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {Array.from({ length: cols }).map((_, c) =>
        Array.from({ length: rows }).map((_, r) => (
          <Bead
            key={`${c}-${r}`}
            x={ox + c * stepX}
            y={oy + r * stepY + (c % 2 === 1 ? bh / 2 + gapY / 2 : 0)}
            w={bw}
            h={bh}
            r={2}
          />
        )),
      )}
    </svg>
  )
}

/** Brick — beads horizontales, filas alternas desplazadas horizontalmente. */
function BrickIcon({ size = 40, className }: IconProps) {
  const cols = 3
  const rows = 5
  const bw = 10
  const bh = 6
  const gapX = 0.8
  const gapY = 0.8
  const stepX = bw + gapX
  const stepY = bh + gapY
  const totalW = cols * stepX + bw / 2
  const totalH = rows * stepY - gapY
  const ox = (48 - totalW) / 2
  const oy = (48 - totalH) / 2
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <Bead
            key={`${r}-${c}`}
            x={ox + c * stepX + (r % 2 === 1 ? bw / 2 + gapX / 2 : 0)}
            y={oy + r * stepY}
            w={bw}
            h={bh}
            r={2}
          />
        )),
      )}
    </svg>
  )
}
