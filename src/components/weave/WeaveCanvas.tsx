import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cell, ColorMap, FringeData, LoopData, RowShape, Technique } from '@/engine/types'
import { cellPosition, gridBoundsUnits, loopAnchorX, rowPitch, type StaggerPhase } from '@/engine/geometry'
import { isPaintableCell, maxFringeLength } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits, METAL_LOOP_INDICATOR_UNITS } from '@/engine/loop'
import { cellsInSameUnit, directionAtStep, peyoteThreadPath, type ThreadStop, type WeaveOrder } from '@/engine/weaveOrder'
import { beadMetricsPx, beadPath as roundRect } from '@/lib/beadStyle'
import { weaveCellPx } from '@/lib/fitZoom'
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
  staggerPhase?: StaggerPhase
  /** Absent/undefined is treated as a full rectangle. Decides which body cells exist (and so are drawn), and anchors the loop. */
  rowShape?: RowShape[]
  /** Hanging loop at the top tip — see `engine/types.ts#LoopData`. Absent = no loop. */
  loop?: LoopData
  /** Drawn row of the bead being worked — its number on the ruler is highlighted, so "fila N" is easy to find. */
  activeRow?: number | null
}

/** Bead size before the container has been measured (and in tests, where nothing is). */
const DEFAULT_CELL_PX = 24
const MARGIN = 28
/** The wrapper's `p-4` padding, on each side. */
const CONTAINER_PADDING_PX = 16
/**
 * Beads already woven stay visible but step back; what's still to come is
 * drawn at full colour, because that's what's being read. (It used to be the
 * other way round: done beads at full strength — and unpainted ones as solid
 * dark squares — while the rest of the pattern faded to a quarter.)
 */
const WOVEN_ALPHA = 0.4
/** The thread, in the pink the weaver drew it in — clear of every bead colour's ring (gold) and outline (blue). */
const THREAD_COLOR = '#e5579b'
/**
 * The thread already woven stays in view, lighter, so the last turn and the
 * wave of the previous pass can be followed back. Only that far: drawn all
 * the way to the foundation, the passes cross over each other into a lattice
 * that hides the path instead of teaching it.
 */
const THREAD_WOVEN_ALPHA = 0.5
/** How far past the edge bead's centre the thread swings when it turns (in beads) — clear of the bead itself. */
const THREAD_TURN_REACH = 0.9

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
  activeRow = null,
}: WeaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const pointerCancelled = useRef(false)
  const bounds = gridBoundsUnits(technique, cols, rows, maxFringeLength(fringe))
  const loopUnits = loopReserveUnits(loop)

  /**
   * Bead size follows the space weave mode has — see `lib/fitZoom.ts#weaveCellPx`.
   * Re-measured when the window or the phone's orientation changes.
   */
  const [cellPx, setCellPx] = useState(DEFAULT_CELL_PX)
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const measure = () =>
      setCellPx(
        weaveCellPx({
          boundsWidth: bounds.width,
          boundsHeight: bounds.height + loopUnits,
          viewportWidth: container.clientWidth - CONTAINER_PADDING_PX * 2,
          viewportHeight: container.clientHeight - CONTAINER_PADDING_PX * 2,
          margin: MARGIN,
        }),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [bounds.width, bounds.height, loopUnits])
  const CELL_PX = cellPx
  // The loop's ring sits above row 0, so it pushes the body down instead of
  // widening the grid — `MARGIN` stays the X origin, `originY` is the Y one.
  const originY = MARGIN + loopUnits * CELL_PX
  // Peyote draws the thread turning around the right edge too, so it needs a
  // little room there (the left has the ruler gutter already).
  const rightGutter = technique === 'peyote' ? CELL_PX * THREAD_TURN_REACH : 0
  const width = bounds.width * CELL_PX + MARGIN + rightGutter
  const height = bounds.height * CELL_PX + originY

  const indexByCell = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((step, i) => step.cells.forEach((c) => m.set(cellKey(c.row, c.col), i)))
    return m
  }, [order])

  // "Next bead" ring/arrow start from the upcoming step's first cell — its top bead, for a brick
  // 2-drop/3-drop stitch, whose whole stack is ringed.
  // The loop is its own final step and isn't part of the grid (its synthetic
  // cells carry row -1 purely as a counting key), so the "next bead" ring and
  // the tap target follow the drawn arch instead of a cell position.
  const nextStep = order[currentIndex + 1]
  const nextIsLoop = nextStep?.isLoop === true
  const nextCell = nextIsLoop ? undefined : nextStep?.cells[0]
  const nextStitchCells = useMemo(() => (nextIsLoop || !nextStep ? [] : nextStep.cells), [nextIsLoop, nextStep])
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
  }, [technique, cols, rows, rowShape, staggerPhase, originY, CELL_PX])
  /**
   * Peyote: the thread's real path, up to and including the step about to be
   * worked — see `engine/weaveOrder.ts#peyoteThreadPath`. It replaces the
   * arrow, because in peyote "which way" isn't the whole story: the needle
   * goes through a bead of the previous pass between every new one. The
   * other techniques (and a peyote fringe) keep the arrow.
   */
  const threadStops = useMemo(
    () => (technique === 'peyote' && nextStep && !nextStep.isFringe && !nextStep.isLoop ? peyoteThreadPath(order, currentIndex + 1, cols) : null),
    [technique, order, currentIndex, cols, nextStep],
  )
  const direction = useMemo(
    () => (threadStops ? null : directionAtStep(technique, order, currentIndex + 1, rows, staggerPhase)),
    [threadStops, technique, order, currentIndex, rows, staggerPhase],
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

    const styles = getComputedStyle(canvas)
    // An unpainted bead is the theme's own empty-bead grey, as in the editor — not a fixed dark block.
    const emptyColor = styles.getPropertyValue('--nb-surface-3').trim() || '#3a3a3d'
    const rulerColor = styles.getPropertyValue('--nb-text-muted').trim() || '#a3a0a8'
    // Every bead gets the editor's thin outline, so a black bead on the dark
    // theme (or a white one on the light) still reads as a bead.
    const outlineColor = styles.getPropertyValue('--nb-grid-line').trim() || '#3a3a3d'

    const { inset, radius, width: beadW, height: beadH } = beadMetricsPx(CELL_PX, technique)
    // The space one row actually takes — outlines hug the bead, not a full square cell.
    const rowStepPx = rowPitch(technique) * CELL_PX

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // A shaped body (a brick triangle, a rhombus) has no bead here: draw
        // nothing, as the editor does, so the silhouette is what shows. These
        // cells aren't in the weave order either, so drawing them used to mark
        // them "already woven" — a block of solid dark squares around the
        // body that hid its outline.
        if (!isPaintableCell(row, col, cols, rows, undefined, rowShape)) continue
        const pos = cellPosition(technique, row, col, undefined, staggerPhase)
        const x = MARGIN + pos.x * CELL_PX + inset
        const y = originY + pos.y * CELL_PX + inset
        const w = beadW
        const h = beadH
        const hex = cells[cellKey(row, col)] ?? emptyColor
        const idx = indexByCell.get(cellKey(row, col)) ?? -1
        const done = idx <= currentIndex

        ctx.globalAlpha = done ? WOVEN_ALPHA : 1
        ctx.beginPath()
        roundRect(ctx, x, y, w, h, radius)
        ctx.fillStyle = hex
        ctx.fill()
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = 1
        ctx.stroke()
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
        const w = beadW
        const h = beadH
        const hex = cells[cellKey(row, col)] ?? emptyColor
        const idx = indexByCell.get(cellKey(row, col)) ?? -1
        const done = idx <= currentIndex

        ctx.globalAlpha = done ? WOVEN_ALPHA : 1
        ctx.beginPath()
        roundRect(ctx, x, y, w, h, radius)
        ctx.fillStyle = hex
        ctx.fill()
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }

    // Hanging loop — drawn like the body/fringe (dimmed until its step is
    // reached), but as a ring above the top tip rather than as grid cells.
    if (loop) {
      const { x: anchorX, y: anchorY } = loopAnchor
      ctx.globalAlpha = loopDone ? WOVEN_ALPHA : 1
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
      roundRect(ctx, x - 1, y - 1, CELL_PX + 2, rowStepPx + 2, radius + 1)
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
        roundRect(ctx, MARGIN + pos.x * CELL_PX, originY + pos.y * CELL_PX, CELL_PX, rowStepPx, radius)
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
      // A brick 2-drop/3-drop stitch is a stack of beads picked up together: ring them all.
      for (const cell of nextStitchCells) {
        const p = cellPosition(technique, cell.row, cell.col, rows, staggerPhase)
        ctx.beginPath()
        roundRect(ctx, MARGIN + p.x * CELL_PX - 1, originY + p.y * CELL_PX - 1, CELL_PX + 2, rowStepPx + 2, radius + 1)
        ctx.stroke()
      }

      if (threadStops) {
        const centerOf = (cell: Cell) => {
          const p = cellPosition(technique, cell.row, cell.col, rows, staggerPhase)
          return { x: MARGIN + p.x * CELL_PX + CELL_PX / 2, y: originY + p.y * CELL_PX + rowStepPx / 2 }
        }
        drawThread(ctx, threadStops, currentIndex + 1, centerOf, CELL_PX)
      } else if (direction) {
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
    ctx.fillStyle = rulerColor
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
      if (r === activeRow) continue
      const pos = cellPosition(technique, r, 0, undefined, staggerPhase)
      ctx.fillText(String(r + 1), MARGIN - 6, originY + pos.y * CELL_PX + CELL_PX / 2 + 3)
    }
    // El fleco cuenta aparte, desde 1, igual que en el editor: sus filas no son
    // filas del cuerpo. Va en dorado para que las dos cuentas no se lean
    // seguidas. `activeRow` cae en la zona del fleco cuando se está tejiendo
    // uno, y entonces esa profundidad se destaca como se destaca una fila.
    const maxFringe = maxFringeLength(fringe)
    for (let depth = 0; depth < maxFringe; depth += step) {
      if (rows + depth === activeRow) continue
      const pos = cellPosition(technique, rows + depth, 0, rows, staggerPhase)
      ctx.fillStyle = '#c9a227'
      ctx.globalAlpha = 0.75
      ctx.fillText(String(depth + 1), MARGIN - 6, originY + pos.y * CELL_PX + CELL_PX / 2 + 3)
      ctx.globalAlpha = 1
    }
    if (activeRow !== null) {
      const pos = cellPosition(technique, activeRow, 0, rows, staggerPhase)
      // En el fleco el número es su profundidad; en el cuerpo, la fila.
      const label = activeRow >= rows ? activeRow - rows + 1 : activeRow + 1
      ctx.fillStyle = '#c9a227'
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.fillText(String(label), MARGIN - 4, originY + pos.y * CELL_PX + CELL_PX / 2 + 4)
    }
  }, [technique, cols, rows, cells, fringe, currentIndex, indexByCell, nextCell, nextStitchCells, direction, threadStops, width, height, staggerPhase, loop, loopAnchor, loopDone, nextIsLoop, originY, currentUnitCells, threadThroughCells, CELL_PX, activeRow])

  /**
   * Keeps the next bead in view. A strip fitted to its width is taller than the
   * screen, and having to scroll to find where you are is exactly what weave
   * mode is meant to save — so when the next bead drifts out of the visible
   * area, the canvas glides to bring it back to the middle. It doesn't move
   * while the bead is still on screen, so it never fights a manual pan.
   */
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas || !nextCell || typeof container.scrollBy !== 'function') return
    const pos = cellPosition(technique, nextCell.row, nextCell.col, rows, staggerPhase)
    const canvasRect = canvas.getBoundingClientRect()
    const viewRect = container.getBoundingClientRect()
    const beadTop = canvasRect.top + originY + pos.y * CELL_PX
    const beadLeft = canvasRect.left + MARGIN + pos.x * CELL_PX
    const margin = CELL_PX
    const outOfView =
      beadTop < viewRect.top + margin ||
      beadTop + CELL_PX > viewRect.bottom - margin ||
      beadLeft < viewRect.left + margin ||
      beadLeft + CELL_PX > viewRect.right - margin
    if (!outOfView) return
    container.scrollBy({
      top: beadTop + CELL_PX / 2 - (viewRect.top + viewRect.height / 2),
      left: beadLeft + CELL_PX / 2 - (viewRect.left + viewRect.width / 2),
      behavior: 'smooth',
    })
  }, [nextCell, technique, rows, staggerPhase, originY, CELL_PX])

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
      ref={containerRef}
      className="no-scrollbar h-full w-full overflow-auto p-4"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="flex min-h-full min-w-full items-center justify-center">
        <canvas ref={canvasRef} className="cursor-pointer" />
      </div>
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

/**
 * The thread through a peyote piece, as the weaver would draw it on the chart:
 * a tail coming in from the left, straight through the foundation, then
 * waving along each pass between the new beads and the ones it goes back
 * through, and swinging out around the edge wherever it turns. The previous
 * pass and what's done of this one are drawn lighter; the stretch of `activeStep` — the bead being strung
 * and the bead it then goes through — is drawn bold and ends in an arrowhead
 * where the needle comes out.
 */
function drawThread(
  ctx: CanvasRenderingContext2D,
  stops: ThreadStop[],
  activeStep: number,
  centerOf: (cell: Cell) => { x: number; y: number },
  cellPx: number,
) {
  if (stops.length === 0) return
  const points = stops.map((stop) => centerOf(stop.cell))
  const reach = cellPx * THREAD_TURN_REACH
  const firstActive = Math.max(0, stops.findIndex((stop) => stop.step === activeStep))
  const activePass = stops[firstActive].pass
  const firstShown = stops.findIndex((stop) => stop.pass >= activePass - 1)

  /** Continues the current path from point i-1 to point i (or starts it: at the tail, or where the shown thread begins). */
  const segmentTo = (i: number) => {
    const to = points[i]
    if (i === 0) {
      ctx.moveTo(to.x - cellPx, to.y)
      ctx.lineTo(to.x, to.y)
      return
    }
    if (i === firstShown) {
      ctx.moveTo(to.x, to.y)
      return
    }
    const from = points[i - 1]
    const stop = stops[i]
    if (stop.turnBefore) {
      const edgeX = stop.turnSide === 'right' ? Math.max(from.x, to.x) + reach : Math.min(from.x, to.x) - reach
      ctx.bezierCurveTo(edgeX, from.y, edgeX, to.y, to.x, to.y)
    } else {
      ctx.lineTo(to.x, to.y)
    }
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = THREAD_COLOR

  // Thread already woven.
  if (firstActive > firstShown) {
    ctx.globalAlpha = THREAD_WOVEN_ALPHA
    ctx.lineWidth = Math.max(1.5, cellPx * 0.08)
    ctx.beginPath()
    for (let i = firstShown; i < firstActive; i++) segmentTo(i)
    ctx.stroke()
  }

  // The stretch the needle is about to make.
  ctx.globalAlpha = 1
  ctx.lineWidth = Math.max(2.5, cellPx * 0.12)
  ctx.beginPath()
  if (firstActive > 0) ctx.moveTo(points[firstActive - 1].x, points[firstActive - 1].y)
  for (let i = firstActive; i < points.length; i++) segmentTo(i)
  ctx.stroke()

  // Arrowhead where it comes out, pointing the way it's travelling.
  const tip = points[points.length - 1]
  const last = stops[stops.length - 1]
  const before = points.length > 1 ? points[points.length - 2] : { x: tip.x - cellPx, y: tip.y }
  // Coming out of a turn the thread heads back into the piece, away from the edge it wrapped.
  const angle = last.turnBefore ? (last.turnSide === 'right' ? Math.PI : 0) : Math.atan2(tip.y - before.y, tip.x - before.x)
  const head = Math.max(7, cellPx * 0.32)
  ctx.fillStyle = THREAD_COLOR
  ctx.beginPath()
  ctx.moveTo(tip.x + Math.cos(angle) * head * 0.35, tip.y + Math.sin(angle) * head * 0.35)
  ctx.lineTo(tip.x - head * Math.cos(angle - Math.PI / 6), tip.y - head * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(tip.x - head * Math.cos(angle + Math.PI / 6), tip.y - head * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
