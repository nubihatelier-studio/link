import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { cellAtPosition, cellPosition, gridBoundsUnits } from '@/engine/geometry'
import { cellKey, parseCellKey } from '@/engine/cellKey'
import { lineCells } from '@/engine/line'
import { contrastTextColor } from '@/lib/color'

const BASE_CELL_PX = 30
const MARGIN = 28

export function CanvasGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPointerDown = useRef(false)
  const lastCell = useRef<{ row: number; col: number } | null>(null)
  // Line tool supports two gestures: click-cell-then-click-cell (no drag
  // needed), or the classic press-drag-release. `lineArmedByThisPress` is
  // true only for the very press that just set `lineStart`, so pointerUp
  // can tell "did the user just drag to finish the line" apart from "did
  // they just tap to start one and let go" (which should leave it pending
  // for a second, separate click).
  const lineArmedByThisPress = useRef(false)
  const lineDragged = useRef(false)
  const [lineStart, setLineStart] = useState<{ row: number; col: number } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null)
  const [focusCell, setFocusCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 })

  // ---- pinch-to-zoom / two-finger pan ----
  // Tracks every currently-down pointer by id so we can tell a one-finger
  // draw gesture from a two-finger pinch/pan gesture. Deliberately simple:
  // zoom follows the ratio of the two-finger distance, and panning follows
  // the raw movement of the midpoint between the two fingers — not a
  // precise "zoom anchored under your fingers" transform (which would need
  // to solve for scroll offset from the zoom origin), but it feels natural
  // for a bead chart where you mostly pinch OR pan, not both at once.
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ startDist: number; startZoom: number; midX: number; midY: number } | null>(null)

  const {
    technique,
    cols,
    rows,
    cells,
    tool,
    slots,
    activeSlot,
    zoom,
    setZoom,
    selection,
    clipboard,
    pasteArmed,
    pasteFlipH,
    pasteFlipV,
    toggleFlipH,
    toggleFlipV,
    setSelection,
    strokeStart,
    strokeCell,
    strokeEnd,
    paintLine,
    pickColor,
    pasteClipboardAt,
    copySelection,
    armPaste,
    disarmPaste,
    colorLetters,
  } = useEditorStore()

  const cellPx = BASE_CELL_PX * (zoom / 100)
  const bounds = gridBoundsUnits(technique, cols, rows)
  const canvasWidth = bounds.width * cellPx + MARGIN
  const canvasHeight = bounds.height * cellPx + MARGIN
  const activeColor = slots[activeSlot]

  // Leaving the line tool (or switching patterns) abandons any pending
  // click-to-start line so it doesn't linger and surprise a later click.
  useEffect(() => {
    if (tool !== 'line') {
      setLineStart(null)
      lineArmedByThisPress.current = false
      lineDragged.current = false
    }
  }, [tool])

  function toBeadUnits(clientX: number, clientY: number) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left - MARGIN) / cellPx
    const y = (clientY - rect.top - MARGIN) / cellPx
    return { x, y }
  }

  function cellFromEvent(e: { clientX: number; clientY: number }) {
    const { x, y } = toBeadUnits(e.clientX, e.clientY)
    return cellAtPosition(technique, x, y)
  }

  function inBounds(row: number, col: number) {
    return row >= 0 && col >= 0 && row < rows && col < cols
  }

  // ---- rendering ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`
    ctx.scale(dpr, dpr)

    const styles = getComputedStyle(canvas)
    const borderColor = styles.getPropertyValue('--nb-grid-line').trim() || '#3a3a3d'
    const emptyColor = styles.getPropertyValue('--nb-surface-3').trim() || '#2c2c2e'
    const textColor = styles.getPropertyValue('--nb-text-muted').trim() || '#a3a0a8'
    const accent = '#c9a227'

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // rulers
    ctx.fillStyle = textColor
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const colStep = cellPx < 10 ? 10 : cellPx < 16 ? 5 : 1
    for (let c = 0; c < cols; c += colStep) {
      const pos = cellPosition(technique, 0, c)
      ctx.fillText(String(c + 1), MARGIN + pos.x * cellPx + cellPx / 2, MARGIN / 2)
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < rows; r += colStep) {
      const pos = cellPosition(technique, r, 0)
      ctx.fillText(String(r + 1), MARGIN - 6, MARGIN + pos.y * cellPx + cellPx / 2)
    }

    const radius = Math.max(1.5, cellPx * 0.12)
    const inset = Math.max(0.5, cellPx * 0.05)
    // Every 5th/10th cell gets a bolder edge (like cross-stitch chart
    // counting guides), so large grids stay readable and easy to click
    // precisely without losing count.
    const groupStep = cellPx < 12 ? 10 : 5
    // Below this cell size a letter badge would just be noise — only stamp
    // it on once cells are big enough to read, same idea as the PDF chart.
    const showLetters = cellPx >= 16
    if (showLetters) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${Math.max(9, cellPx * 0.42)}px system-ui, sans-serif`
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const pos = cellPosition(technique, row, col)
        const x = MARGIN + pos.x * cellPx + inset
        const y = MARGIN + pos.y * cellPx + inset
        const w = cellPx - inset * 2
        const h = cellPx - inset * 2
        const hex = cells[cellKey(row, col)]

        ctx.beginPath()
        roundRect(ctx, x, y, w, h, radius)
        ctx.fillStyle = hex ?? emptyColor
        ctx.fill()
        // Always stroke a subtle edge, even on filled cells, so every cell
        // reads clearly on its own instead of blending into its neighbors.
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.stroke()

        const isGroupEdge = (col + 1) % groupStep === 0 || (row + 1) % groupStep === 0
        if (isGroupEdge && col < cols - 1 && row < rows - 1) {
          ctx.strokeStyle = borderColor
          ctx.globalAlpha = 0.9
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        if (hex && showLetters) {
          const letter = colorLetters[hex]
          if (letter) {
            ctx.fillStyle = contrastTextColor(hex)
            ctx.fillText(letter, x + w / 2, y + h / 2 + 0.5)
          }
        }
      }
    }

    // paste ghost preview — shows exactly where the clipboard will land
    // (including per-cell colors and the current flip) before you commit
    // with a click, instead of pasting blind.
    if (pasteArmed && clipboard && hoverCell) {
      ctx.globalAlpha = 0.6
      for (const [key, hex] of Object.entries(clipboard.cells)) {
        if (!hex) continue
        const { row: rr, col: rc } = parseCellKey(key)
        const fr = pasteFlipV ? clipboard.height - 1 - rr : rr
        const fc = pasteFlipH ? clipboard.width - 1 - rc : rc
        const targetRow = hoverCell.row + fr
        const targetCol = hoverCell.col + fc
        if (!inBounds(targetRow, targetCol)) continue
        const pos = cellPosition(technique, targetRow, targetCol)
        ctx.beginPath()
        roundRect(
          ctx,
          MARGIN + pos.x * cellPx + inset,
          MARGIN + pos.y * cellPx + inset,
          cellPx - inset * 2,
          cellPx - inset * 2,
          radius,
        )
        ctx.fillStyle = hex
        ctx.fill()
      }
      ctx.globalAlpha = 1
      const origin = cellPosition(technique, hoverCell.row, hoverCell.col)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 3])
      ctx.strokeRect(
        MARGIN + origin.x * cellPx,
        MARGIN + origin.y * cellPx,
        clipboard.width * cellPx,
        clipboard.height * cellPx,
      )
      ctx.setLineDash([])
    } else if (hoverCell && inBounds(hoverCell.row, hoverCell.col) && !isPointerDown.current) {
      // hover highlight — shows exactly which cell a click will affect, so
      // targeting a specific bead on a dense grid stays easy on touch and mouse
      const pos = cellPosition(technique, hoverCell.row, hoverCell.col)
      const x = MARGIN + pos.x * cellPx
      const y = MARGIN + pos.y * cellPx
      ctx.fillStyle = 'rgba(201, 162, 39, 0.18)'
      ctx.fillRect(x, y, cellPx, cellPx)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 0.75, y + 0.75, cellPx - 1.5, cellPx - 1.5)
    }

    // selection overlay
    if (selection) {
      const p0 = cellPosition(technique, selection.r0, selection.c0)
      const p1 = cellPosition(technique, selection.r1, selection.c1)
      const x0 = MARGIN + Math.min(p0.x, p1.x) * cellPx
      const y0 = MARGIN + Math.min(p0.y, p1.y) * cellPx
      const w = (Math.max(p0.x, p1.x) - Math.min(p0.x, p1.x) + 1) * cellPx
      const h = (Math.max(p0.y, p1.y) - Math.min(p0.y, p1.y) + 1) * cellPx
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(x0, y0, w, h)
      ctx.setLineDash([])
    }

    // line preview
    if (tool === 'line' && lineStart && hoverCell) {
      for (const c of lineCells(lineStart.row, lineStart.col, hoverCell.row, hoverCell.col)) {
        if (!inBounds(c.row, c.col)) continue
        const pos = cellPosition(technique, c.row, c.col)
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        roundRect(ctx, MARGIN + pos.x * cellPx + inset, MARGIN + pos.y * cellPx + inset, cellPx - inset * 2, cellPx - inset * 2, radius)
        ctx.fillStyle = activeColor
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // keyboard focus ring
    if (inBounds(focusCell.row, focusCell.col)) {
      const pos = cellPosition(technique, focusCell.row, focusCell.col)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(MARGIN + pos.x * cellPx, MARGIN + pos.y * cellPx, cellPx, cellPx)
    }
  }, [
    technique,
    cols,
    rows,
    cells,
    zoom,
    selection,
    tool,
    lineStart,
    hoverCell,
    activeColor,
    canvasWidth,
    canvasHeight,
    focusCell,
    colorLetters,
    pasteArmed,
    clipboard,
    pasteFlipH,
    pasteFlipV,
  ])

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  function handlePointerDown(e: React.PointerEvent) {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size === 2) {
      // Second finger just landed: abandon whatever single-finger gesture
      // was in progress (closing its undo step properly) and switch to pinch.
      if (isPointerDown.current) strokeEnd()
      isPointerDown.current = false
      lastCell.current = null
      setLineStart(null)
      lineArmedByThisPress.current = false
      lineDragged.current = false
      const [p1, p2] = Array.from(activePointers.current.values())
      const mid = midpoint(p1, p2)
      pinch.current = { startDist: dist(p1, p2), startZoom: zoom, midX: mid.x, midY: mid.y }
      return
    }
    if (activePointers.current.size > 2) return // ignore a third finger

    const cell = cellFromEvent(e)
    if (!inBounds(cell.row, cell.col)) return
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      // ignore — capture is a nice-to-have (keeps dragging past canvas edges), not required for painting to work
    }

    if (pasteArmed && clipboard) {
      pasteClipboardAt(cell.row, cell.col, { flipH: pasteFlipH, flipV: pasteFlipV })
      return
    }

    switch (tool) {
      case 'pencil':
        strokeStart()
        strokeCell(cell.row, cell.col, activeColor)
        lastCell.current = cell
        isPointerDown.current = true
        break
      case 'eraser':
        strokeStart()
        strokeCell(cell.row, cell.col, null)
        lastCell.current = cell
        isPointerDown.current = true
        break
      case 'eyedropper':
        pickColor(cell.row, cell.col)
        break
      case 'line':
        if (!lineStart) {
          // First click: just mark the start. Nothing is painted yet —
          // either drag from here to draw in one motion, or release and
          // click a second cell later to finish it.
          setLineStart(cell)
          lineArmedByThisPress.current = true
          lineDragged.current = false
        } else {
          // Second click: this cell is the endpoint, finish the line now.
          paintLine(lineStart.row, lineStart.col, cell.row, cell.col, activeColor)
          setLineStart(null)
          lineArmedByThisPress.current = false
          lineDragged.current = false
        }
        break
      case 'select':
      case 'rectErase':
        setSelection({ r0: cell.row, c0: cell.col, r1: cell.row, c1: cell.col })
        isPointerDown.current = true
        break
    }
    setFocusCell(cell)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (activePointers.current.size === 2 && pinch.current) {
      const [p1, p2] = Array.from(activePointers.current.values())
      const newDist = dist(p1, p2)
      const mid = midpoint(p1, p2)
      const scale = newDist / pinch.current.startDist
      setZoom(Math.round(pinch.current.startZoom * scale))
      const container = containerRef.current
      if (container) {
        container.scrollLeft -= mid.x - pinch.current.midX
        container.scrollTop -= mid.y - pinch.current.midY
      }
      pinch.current.midX = mid.x
      pinch.current.midY = mid.y
      return
    }
    if (activePointers.current.size >= 2) return

    const cell = cellFromEvent(e)
    setHoverCell(cell)

    if (
      tool === 'line' &&
      lineArmedByThisPress.current &&
      lineStart &&
      (cell.row !== lineStart.row || cell.col !== lineStart.col)
    ) {
      lineDragged.current = true
    }

    if (!isPointerDown.current) return
    if (!inBounds(cell.row, cell.col)) return

    if (tool === 'pencil' || tool === 'eraser') {
      if (lastCell.current && lastCell.current.row === cell.row && lastCell.current.col === cell.col) return
      strokeCell(cell.row, cell.col, tool === 'pencil' ? activeColor : null)
      lastCell.current = cell
    } else if (tool === 'select' || tool === 'rectErase') {
      setSelection({ r0: selection?.r0 ?? cell.row, c0: selection?.c0 ?? cell.col, r1: cell.row, c1: cell.col })
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) pinch.current = null
    if (activePointers.current.size >= 1) return // still mid-pinch (or settling back to one finger): don't treat as a draw release

    if (tool === 'pencil' || tool === 'eraser') {
      if (isPointerDown.current) strokeEnd()
    } else if (tool === 'line' && lineArmedByThisPress.current) {
      // Only a real drag (moved to a different cell before releasing)
      // finishes the line here. A plain tap leaves `lineStart` armed so a
      // later, separate click can supply the endpoint instead.
      if (lineDragged.current && lineStart && hoverCell) {
        paintLine(lineStart.row, lineStart.col, hoverCell.row, hoverCell.col, activeColor)
        setLineStart(null)
      }
      lineArmedByThisPress.current = false
      lineDragged.current = false
    } else if (tool === 'rectErase') {
      useEditorStore.getState().eraseSelection()
      setSelection(null)
    }
    isPointerDown.current = false
    lastCell.current = null
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (meta && key === 'c') {
      if (selection) {
        e.preventDefault()
        copySelection()
      }
      return
    }
    if (meta && key === 'v') {
      if (clipboard) {
        e.preventDefault()
        armPaste()
      }
      return
    }
    if (pasteArmed && key === 'h' && !meta) {
      e.preventDefault()
      toggleFlipH()
      return
    }
    if (pasteArmed && key === 'v' && !meta) {
      e.preventDefault()
      toggleFlipV()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (pasteArmed) disarmPaste()
      else if (lineStart) {
        setLineStart(null)
        lineArmedByThisPress.current = false
        lineDragged.current = false
      } else if (selection) setSelection(null)
      return
    }

    let { row, col } = focusCell
    if (e.key === 'ArrowUp') row = Math.max(0, row - 1)
    else if (e.key === 'ArrowDown') row = Math.min(rows - 1, row + 1)
    else if (e.key === 'ArrowLeft') col = Math.max(0, col - 1)
    else if (e.key === 'ArrowRight') col = Math.min(cols - 1, col + 1)
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      const hex = tool === 'eraser' ? null : activeColor
      strokeStart()
      strokeCell(row, col, hex)
      strokeEnd()
      return
    } else {
      return
    }
    e.preventDefault()
    setFocusCell({ row, col })
  }

  return (
    <div className="relative h-full w-full">
      {pasteArmed && clipboard && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-2/90 px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          Tocá una celda para pegar · H/V voltear · Esc cancelar
        </div>
      )}
      {!pasteArmed && tool === 'line' && lineStart && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-2/90 px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          Tocá otra celda para terminar la línea · Esc cancelar
        </div>
      )}
      <div
        ref={containerRef}
        className="no-scrollbar h-full w-full overflow-auto bg-canvas p-4"
        tabIndex={0}
        role="grid"
        aria-label="Lienzo del patrón"
        onKeyDown={handleKeyDown}
      >
        <div className="flex min-h-full min-w-full items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => setHoverCell(null)}
            className="cursor-crosshair touch-none"
          />
        </div>
      </div>
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
