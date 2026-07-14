import { useEffect, useRef } from 'react'
import type { PatternDoc } from '@/engine/types'
import { cellPosition, gridBoundsUnits } from '@/engine/geometry'
import { parseCellKey } from '@/engine/cellKey'

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

    const { technique, cols, rows } = pattern.config
    const bounds = gridBoundsUnits(technique, cols, rows)
    const scale = Math.min(size / Math.max(bounds.width, 1), size / Math.max(bounds.height, 1))
    const offsetX = (size - bounds.width * scale) / 2
    const offsetY = (size - bounds.height * scale) / 2
    const cell = Math.max(1, scale * 0.98)

    ctx.fillStyle = 'rgba(127,127,127,0.08)'
    ctx.fillRect(0, 0, size, size)

    for (const [key, hex] of Object.entries(pattern.cells)) {
      if (!hex) continue
      const { row, col } = parseCellKey(key)
      const pos = cellPosition(technique, row, col)
      ctx.fillStyle = hex
      ctx.fillRect(offsetX + pos.x * scale, offsetY + pos.y * scale, cell, cell)
    }
  }, [pattern, size])

  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-lg" />
}
