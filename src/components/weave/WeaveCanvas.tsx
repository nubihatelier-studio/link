import { useEffect, useMemo, useRef } from 'react'
import type { Cell, ColorMap, FringeData, LoopData, RowShape, Technique } from '@/engine/types'
import { cellPosition, gridBoundsUnits, loopAnchorX } from '@/engine/geometry'
import { maxFringeLength } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits, METAL_LOOP_INDICATOR_UNITS } from '@/engine/loop'
import { cellsInSameUnit, directionAtStep, type WeaveOrder } from '@/engine/weaveOrder'
import { beadMetricsPx, beadPath as roundRect } from '@/lib/beadStyle'
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
  /**
   * Any tap on the pattern advances, instead of only one landing on the next
   * bead. On by default because it's the setting that works with a needle in
   * hand; off is the precise option, for when a stray touch shouldn't count.
   */
  tapAnywhere?: boolean
  /**
   * Peyote only: the previous pass's beads, which the current pass threads
   * *through* instead of adding to. Outlined rather than filled — they're the
   * landmark the needle looks for, not something being strung. See
   * `engine/weaveOrder.ts#peyoteThreadThroughCells`.
   */
  threadThroughCells?: Cell[]
  staggerPhase?: 0 | 1
  /** Absent/undefined is treated as a full rectangle — only used to anchor the loop. */
  rowShape?: RowShape[]
  /** Hanging loop at the top tip — see `engine/types.ts#LoopData`. Absent = no loop. */
  loop?: LoopData
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
  tapAnywhere = true,
  threadThroughCells,
  staggerPhase = 0,
  rowShape,
  loop,
}: WeaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const pointerCancelled = useRef(false)
  const bounds = gridBoundsUnits(technique, cols, rows, maxFringeLength(fringe))
  // The loop's ring sits above row 0, so it pushes the body down instead of
  // widening the grid — `MARGIN` stays the X origin, `originY` is the Y one.
  const originY = MARGIN + loopReserveUnits(loop) * CELL_PX
  const width = bounds.width * CELL_PX + MARGIN
  const height = bounds.height * CELL_PX + originY

  const indexByCell = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((step, i) => step.cells.forEach((c) => m.set(cellKey(c.row, c.col), i)))
    return m
  }, [order])

  // "Next bead" ring/arrow always target the upcoming step's first cell — for a grouped step
  // (peyote's foundation pass) that's as precise as a single ring can be; the full set of beads
  // it covers is what the word chart/hands-busy instruction spells out.
  // The loop is its own final step and isn't part of the grid (its synthetic
  // cells carry row -1 purely as a counting key), so the "next bead" ring and
  // the tap target follow the drawn arch instead of a cell position.
  const nextStep = order[currentIndex + 1]
  const nextIsLoop = nextStep?.isLoop === true
  const nextCell = nextIsLoop ? undefined : nextStep?.cells[0]
  /**
   * Every bead of the pass (or row) about to be worked, so the weaver sees the
   * whole instruction at once instead of only the single next bead. The bright
   * "next" ring still marks where to start within it.
   */
  const currentUnitCells = useMemo(() => cellsInSameUnit(order, currentIndex + 1), [order, currentIndex])
  const loopStepIndex = useMemo(() => order.findIndex((step) => step.isLoop), [order])
  const loopDone = loopStepIndex >= 0 && loopStepIndex <= currentIndex

  /** Canvas point the loop hangs from: the horizontal center of the body's top row, on its top edge. */
  const loopAnchor = useMemo(() => {
    const anchorXUnits = loopAnchorX(technique, cols, rowShape, staggerPhase)
    const gridOrigin = cellPosition(technique, 0, 0, rows, staggerPhase)
    return { x: MARGIN + (anchorXUnits - gridOrigin.x) * CELL_PX, y: originY }
  }, [technique, cols, rows, rowShape, staggerPhase, originY])
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

    const { inset, radius } = beadMetricsPx(CELL_PX)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pos = cellPosition(technique, row, col, undefined, staggerPhase)
        const x = MARGIN + pos.x * CELL_PX + inset
        const y = originY + pos.y * CELL_PX + inset
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
        const y = originY + pos.y * CELL_PX + inset
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

    // Hanging loop — drawn like the body/fringe (dimmed until its step is
    // reached), but as a ring above the top tip rather than as grid cells.
    if (loop) {
      const { x: anchorX, y: anchorY } = loopAnchor
      ctx.globalAlpha = loopDone ? 1 : 0.25
      if (loop.variant === 'woven') {
        for (const { dx, dy } of loopBeadOffsets(loopBeadCount(loop))) {
          ctx.beginPath()
          ctx.arc(anchorX + dx * CELL_PX, anchorY + dy * CELL_PX, CELL_PX * 0.42, 0, Math.PI * 2)
          ctx.fillStyle = loop.color
          ctx.fill()
        }
      } else {
        const outer = (METAL_LOOP_INDICATOR_UNITS / 2) * CELL_PX
        ctx.beginPath()
        ctx.arc(anchorX, anchorY - outer, outer * 0.78, 0, Math.PI * 2)
        ctx.strokeStyle = '#a3a0a8'
        ctx.lineWidth = Math.max(1, CELL_PX * 0.14)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      if (nextIsLoop) {
        const reach = loopReserveUnits(loop) * CELL_PX
        ctx.strokeStyle = '#c9a227'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(anchorX, anchorY - reach / 2, reach + CELL_PX * 0.5, Math.PI, 0)
        ctx.stroke()
      }
    }

    // The pass about to be worked, as a soft band behind its beads — the
    // instruction is "these beads", not just the one under the ring.
    for (const cell of currentUnitCells) {
      if (cell.row < 0) continue
      const pos = cellPosition(technique, cell.row, cell.col, rows, staggerPhase)
      const x = MARGIN + pos.x * CELL_PX
      const y = originY + pos.y * CELL_PX
      ctx.globalAlpha = 0.22
      ctx.beginPath()
      roundRect(ctx, x - 1, y - 1, CELL_PX + 2, CELL_PX + 2, radius + 1)
      ctx.fillStyle = '#c9a227'
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Beads the needle passes *through* on this pass (peyote): a dashed
    // outline, deliberately unlike the solid "next bead" ring — nothing is
    // strung into them, they're the reference you thread by.
    if (threadThroughCells && threadThroughCells.length > 0) {
      ctx.strokeStyle = '#7fb6c4'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      for (const cell of threadThroughCells) {
        if (cell.row < 0) continue
        const pos = cellPosition(technique, cell.row, cell.col, rows, staggerPhase)
        ctx.beginPath()
        roundRect(ctx, MARGIN + pos.x * CELL_PX, originY + pos.y * CELL_PX, CELL_PX, CELL_PX, radius)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    if (nextCell) {
      const pos = cellPosition(technique, nextCell.row, nextCell.col, rows, staggerPhase)
      const x = MARGIN + pos.x * CELL_PX
      const y = originY + pos.y * CELL_PX
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
      // In the canvas's own top band, above any loop reserve — see CanvasGrid.
      ctx.fillText(String(c + 1), MARGIN + pos.x * CELL_PX + CELL_PX / 2, MARGIN / 2)
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < rows; r += step) {
      const pos = cellPosition(technique, r, 0, undefined, staggerPhase)
      ctx.fillText(String(r + 1), MARGIN - 6, originY + pos.y * CELL_PX + CELL_PX / 2 + 3)
    }
  }, [technique, cols, rows, cells, fringe, currentIndex, indexByCell, nextCell, direction, width, height, staggerPhase, loop, loopAnchor, loopDone, nextIsLoop, originY, currentUnitCells, threadThroughCells])

  function isNearNextCell(clientX: number, clientY: number): boolean {
    const canvas = canvasRef.current
    if (!canvas) return false
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (nextIsLoop && loop) {
      // Tapping anywhere inside the loop's reserved band counts — the arch is
      // thin, so a cell-sized target would be needlessly fussy.
      const reach = loopReserveUnits(loop) * CELL_PX + CELL_PX
      return Math.hypot(x - loopAnchor.x, y - (loopAnchor.y - reach / 2)) < reach
    }
    if (!nextCell) return false
    const pos = cellPosition(technique, nextCell.row, nextCell.col, rows, staggerPhase)
    const cx = MARGIN + pos.x * CELL_PX + CELL_PX / 2
    const cy = originY + pos.y * CELL_PX + CELL_PX / 2
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
    if (tapAnywhere || isNearNextCell(e.clientX, e.clientY)) onTapNext()
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
