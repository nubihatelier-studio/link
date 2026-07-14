import { useEffect, useMemo, useRef } from 'react'
import type { Cell, ColorMap, Technique } from '@/engine/types'
import { cellPosition, gridBoundsUnits } from '@/engine/geometry'
import { cellKey } from '@/engine/cellKey'
import { directionAtStep } from '@/engine/weaveOrder'

interface WeaveCanvasProps {
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  order: Cell[]
  currentIndex: number
  onTapNext: () => void
}

const CELL_PX = 24
const MARGIN = 28

export function WeaveCanvas({ technique, cols, rows, cells, order, currentIndex, onTapNext }: WeaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bounds = gridBoundsUnits(technique, cols, rows)
  const width = bounds.width * CELL_PX + MARGIN
  const height = bounds.height * CELL_PX + MARGIN

  const indexByCell = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((c, i) => m.set(cellKey(c.row, c.col), i))
    return m
  }, [order])

  const nextCell = order[currentIndex + 1]
  const direction = useMemo(() => directionAtStep(technique, order, currentIndex + 1), [technique, order, currentIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const inset = 1.5
    const radius = 4

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pos = cellPosition(technique, row, col)
        const x = MARGIN + pos.x * CELL_PX + inset
        const y = MARGIN + pos.y * CELL_PX + inset
        const w = CELL_PX - inset * 2
        const h = CELL_PX - inset * 2
        const hex = cells[cellKey(row, col)] ?? '#3a3a3d'
        const idx = indexByCell.get(cellKey(row, col)) ?? -1
        const done = idx <= currentIndex

        ctx.globalAlpha = done ? 1 : 0.25
        ctx.beginPath()
        roundRect(ctx, x, y, w, h, radius)
        ctx.fillStyle = hex
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    if (nextCell) {
      const pos = cellPosition(technique, nextCell.row, nextCell.col)
      const x = MARGIN + pos.x * CELL_PX
      const y = MARGIN + pos.y * CELL_PX
      ctx.strokeStyle = '#c9a227'
      ctx.lineWidth = 3
      ctx.beginPath()
      roundRect(ctx, x - 1, y - 1, CELL_PX + 2, CELL_PX + 2, radius + 1)
      ctx.stroke()

      if (direction) {
        const cx = x + CELL_PX / 2
        const cy = y + CELL_PX / 2
        const len = CELL_PX * 0.9
        const norm = Math.hypot(direction.dx, direction.dy) || 1
        const dx = (direction.dx / norm) * len
        const dy = (direction.dy / norm) * len
        drawArrow(ctx, cx, cy, cx + dx, cy + dy, '#c9a227')
      }
    }

    // ruler
    ctx.fillStyle = '#a3a0a8'
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    const step = cols > 40 ? 10 : cols > 20 ? 5 : 1
    for (let c = 0; c < cols; c += step) {
      const pos = cellPosition(technique, 0, c)
      ctx.fillText(String(c + 1), MARGIN + pos.x * CELL_PX + CELL_PX / 2, MARGIN / 2)
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < rows; r += step) {
      const pos = cellPosition(technique, r, 0)
      ctx.fillText(String(r + 1), MARGIN - 6, MARGIN + pos.y * CELL_PX + CELL_PX / 2 + 3)
    }
  }, [technique, cols, rows, cells, currentIndex, indexByCell, nextCell, direction, width, height])

  function handleClick(e: React.MouseEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (!nextCell) return
    const pos = cellPosition(technique, nextCell.row, nextCell.col)
    const cx = MARGIN + pos.x * CELL_PX + CELL_PX / 2
    const cy = MARGIN + pos.y * CELL_PX + CELL_PX / 2
    if (Math.hypot(x - cx, y - cy) < CELL_PX * 1.5) onTapNext()
  }

  return (
    <div className="no-scrollbar h-full w-full overflow-auto p-4">
      <canvas ref={canvasRef} onClick={handleClick} className="cursor-pointer" />
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()

  const angle = Math.atan2(y1 - y0, x1 - x0)
  const headLen = 6
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}
