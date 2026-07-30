import { useEffect, useMemo, useRef } from 'react'
import type { ColorMap, FringeData, Technique } from '@/engine/types'
import { cellPosition, gridBoundsUnits } from '@/engine/geometry'
import { maxFringeLength } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { directionAtStep, type WeaveOrder } from '@/engine/weaveOrder'
import { TAP_SLOP_PX } from './tapGesture'

interface WeaveCanvasProps {
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  fringe: FringeData
  order: WeaveOrder
  currentIndex: number
  onTapNext: () => void
  staggerPhase?: 0 | 1
}

const CELL_PX = 24
const MARGIN = 28

export function WeaveCanvas({
  technique,
  cols,
  rows,
  cells,
  fringe,
  order,
  currentIndex,
  onTapNext,
  staggerPhase = 0,
}: WeaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const pointerCancelled = useRef(false)
  const bounds = gridBoundsUnits(technique, cols, rows, maxFringeLength(fringe))
  const width = bounds.width * CELL_PX + MARGIN
  const height = bounds.height * CELL_PX + MARGIN

  const indexByCell = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((step, i) => step.cells.forEach((c) => m.set(cellKey(c.row, c.col), i)))
    return m
  }, [order])

  // "Next bead" ring/arrow always target the upcoming step's first cell — for a grouped step
  // (peyote's foundation pass) that's as precise as a single ring can be; the full set of beads
  // it covers is what the word chart/hands-busy instruction spells out.
  const nextCell = order[currentIndex + 1]?.cells[0]
  const direction = useMemo(
    () => directionAtStep(technique, order, currentIndex + 1, rows, staggerPhase),
    [technique, order, currentIndex, rows, staggerPhase],
  )

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
        const pos = cellPosition(technique, row, col, undefined, staggerPhase)
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

    // fringe zone — same per-cell drawing as the body loop above, positioned
    // via cellPosition's fringe branch (see engine/geometry.ts).
    for (let col = 0; col < cols; col++) {
      const length = fringe.lengths[col] ?? 0
      for (let depth = 0; depth < length; depth++) {
        const row = rows + depth
        const pos = cellPosition(technique, row, col, rows, staggerPhase)
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
      const pos = cellPosition(technique, nextCell.row, nextCell.col, rows, staggerPhase)
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
      const pos = cellPosition(technique, 0, c, undefined, staggerPhase)
      ctx.fillText(String(c + 1), MARGIN + pos.x * CELL_PX + CELL_PX / 2, MARGIN / 2)
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < rows; r += step) {
      const pos = cellPosition(technique, r, 0, undefined, staggerPhase)
      ctx.fillText(String(r + 1), MARGIN - 6, MARGIN + pos.y * CELL_PX + CELL_PX / 2 + 3)
    }
  }, [technique, cols, rows, cells, fringe, currentIndex, indexByCell, nextCell, direction, width, height, staggerPhase])

  function isNearNextCell(clientX: number, clientY: number): boolean {
    const canvas = canvasRef.current
    if (!canvas || !nextCell) return false
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const pos = cellPosition(technique, nextCell.row, nextCell.col, rows, staggerPhase)
    const cx = MARGIN + pos.x * CELL_PX + CELL_PX / 2
    const cy = MARGIN + pos.y * CELL_PX + CELL_PX / 2
    return Math.hypot(x - cx, y - cy) < CELL_PX * 1.5
  }

  // Pointer events (not click) so a real tap advances the moment the finger lifts, not after the
  // browser's click-event indirection — but the container also stays `overflow-auto` (panning a
  // large pattern), so we can't just fire on pointerdown or preventDefault it: we track the down
  // position and only treat pointerup as a tap if the finger barely moved (TAP_SLOP_PX), which is
  // the same distinction a scroll/pinch gesture would fail, without blocking native scrolling to
  // get it. Listening on the wrapping div (not just the canvas) means the padding around a small
  // pattern counts as tappable too, not just the exact canvas pixels.
  function handlePointerDown(e: React.PointerEvent) {
    // A second finger going down mid-gesture means a pinch, not a tap — cancel the whole gesture.
    if (pointerStart.current) {
      pointerCancelled.current = true
      return
    }
    pointerStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    pointerCancelled.current = false
  }

  function handlePointerUp(e: React.PointerEvent) {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start || start.pointerId !== e.pointerId || pointerCancelled.current) return
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
    if (moved > TAP_SLOP_PX) return
    if (isNearNextCell(e.clientX, e.clientY)) onTapNext()
  }

  function handlePointerCancel() {
    pointerStart.current = null
  }

  return (
    <div
      className="no-scrollbar h-full w-full overflow-auto p-4"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <canvas ref={canvasRef} className="cursor-pointer" />
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
