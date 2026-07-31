import { useEffect, useRef } from 'react'
import type { PatternDoc } from '@/engine/types'
import { cellPosition, gridBoundsUnits, loopAnchorX } from '@/engine/geometry'
import { maxFringeLength } from '@/engine/fringe'
import { parseCellKey } from '@/engine/cellKey'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits } from '@/engine/loop'

interface PatternThumbProps {
  pattern: PatternDoc
  size?: number
}

export function PatternThumb({ pattern, size = 64 }: PatternThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size, size)

    const { technique, cols, rows, staggerPhase = 0 } = pattern.config
    const { loop } = pattern
    const bounds = gridBoundsUnits(technique, cols, rows, maxFringeLength(pattern.fringe))
    // The loop hangs above row 0, so it only adds height — the body is pushed
    // down by `loopRows` inside the same square, exactly like the exports do.
    const loopRows = loopReserveUnits(loop)
    const totalHeight = bounds.height + loopRows
    const scale = Math.min(size / Math.max(bounds.width, 1), size / Math.max(totalHeight, 1))
    const offsetX = (size - bounds.width * scale) / 2
    const offsetY = (size - totalHeight * scale) / 2 + loopRows * scale
    const cell = Math.max(1, scale * 0.98)

    ctx.fillStyle = 'rgba(127,127,127,0.08)'
    ctx.fillRect(0, 0, size, size)

    for (const [key, hex] of Object.entries(pattern.cells)) {
      if (!hex) continue
      const { row, col } = parseCellKey(key)
      const pos = cellPosition(technique, row, col, rows, staggerPhase)
      ctx.fillStyle = hex
      ctx.fillRect(offsetX + pos.x * scale, offsetY + pos.y * scale, cell, cell)
    }

    // The loop's ring isn't in `cells` (see engine/loop.ts) — drawn here, in the
    // space reserved above, so a hanging piece reads as one in the library too.
    if (loop?.variant === 'woven') {
      const anchorXUnits = loopAnchorX(technique, cols, pattern.rowShape, staggerPhase)
      const origin = cellPosition(technique, 0, 0, rows, staggerPhase)
      const anchorX = offsetX + (anchorXUnits - origin.x) * scale
      ctx.fillStyle = loop.color
      for (const { dx, dy } of loopBeadOffsets(loopBeadCount(loop))) {
        ctx.beginPath()
        ctx.arc(anchorX + dx * scale, offsetY + dy * scale, Math.max(0.5, cell / 2), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [pattern, size])

  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-lg" />
}
