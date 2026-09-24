import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { cellAtPositionWithFringe, cellPosition, gridBoundsUnits, loopAnchorX } from '@/engine/geometry'
import { isPaintableCell, maxFringeLength } from '@/engine/fringe'
import { cellKey, parseCellKey } from '@/engine/cellKey'
import { triangleBoundsUnits, triangleKey } from '@/engine/trianglePeyote'
import { drawTriangleCanvas, triangleBeadAtCanvas } from '@/lib/triangleCanvas'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits, METAL_LOOP_INDICATOR_UNITS } from '@/engine/loop'
import { lineCells } from '@/engine/line'
import { usePatternLetterMap } from '@/hooks/usePatternLetters'
import { letterFontSizePx, shouldShowLetters } from '@/lib/letterVisibility'
import { initialFitZoom } from '@/lib/fitZoom'
import { clampZoom } from '@/lib/zoomScale'
import { useEditorPrefsStore } from '@/store/editorPrefsStore'
import { beadMetricsPx, beadPath as roundRect, contrastTextColor } from '@/lib/beadStyle'
import { t } from '@/i18n/es'

const BASE_CELL_PX = 30
const MARGIN = 28
/**
 * A second finger landing this soon after the first means the two were one
 * pinch that didn't touch down together — so whatever the first finger
 * painted in the meantime is undone, not kept. Later than this, the first
 * finger was deliberately painting and its stroke stays.
 */
export const PINCH_GRACE_MS = 350

export function CanvasGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPointerDown = useRef(false)
  const lastCell = useRef<{ row: number; col: number } | null>(null)
  /** La última mostacilla pintada del peyote triangular, que no se mide en filas y columnas. */
  const lastBeadKey = useRef<string | null>(null)
  /** El cuentagotas del peyote triangular actúa al levantar el dedo, como en la grilla. */
  const pendingBeadTap = useRef<string | null>(null)
  const isFringeSculpting = useRef(false)
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
  /** Pattern id whose opening zoom has already been applied — see the framing effect below. */
  const framedPatternId = useRef<string | null>(null)
  /** The last "Ajustar a pantalla" already answered — see the effect below. */
  const fittedRequest = useRef(0)
  /**
   * Where the finger (or the mouse) was on the last move while dragging with
   * "Mover el gráfico" — the chart follows it one to one. Null when the hand
   * isn't dragging.
   */
  const panFrom = useRef<{ x: number; y: number } | null>(null)
  /**
   * Set by the zoom changes that place the view themselves — the opening
   * framing, and a pinch, which pans with the fingers — so the next redraw
   * doesn't also re-centre it. Every other zoom change (the bar, the keyboard)
   * keeps the middle of the view where it was: see the rendering effect.
   */
  const skipZoomAnchor = useRef(false)
  /** The cell size the canvas was last drawn at, to tell a zoom change from any other redraw. */
  const drawnCellPx = useRef<number | null>(null)
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ startDist: number; startZoom: number; midX: number; midY: number } | null>(null)
  /**
   * The spot a zoom should keep still — under the fingers of a pinch, or the
   * pointer of a trackpad pinch / ctrl+wheel — as a share of the scrollable
   * size plus where on screen it sat. Without it a pinch grew the chart from
   * one corner and whatever was between the fingers slid away, so zooming
   * "went wherever it wanted". Consumed by the next redraw.
   */
  const zoomFocus = useRef<{ bx: number; by: number; toX: number; toY: number } | null>(null)

  /**
   * Remembers the chart point now at client (fromX, fromY) so that after the
   * coming zoom it sits at (toX, toY) — the same spot for a trackpad, and
   * where the fingers have moved to for a pinch, so zooming and panning with
   * two fingers work together the way they do in any photo viewer.
   */
  function focusZoomAt(fromX: number, fromY: number, toX = fromX, toY = fromY) {
    const canvas = canvasRef.current
    const cell = drawnCellPx.current
    if (!canvas || !cell) return
    const rect = canvas.getBoundingClientRect()
    // Measured in beads, past the ruler margin — the one part of the canvas
    // that doesn't grow with the zoom. A share of the whole width drifted by
    // that margin on every step.
    zoomFocus.current = {
      bx: (fromX - rect.left - MARGIN) / cell,
      by: (fromY - rect.top - MARGIN) / cell,
      toX,
      toY,
    }
  }
  /** When the current pencil/eraser stroke began — see `PINCH_GRACE_MS`. */
  const strokeStartedAt = useRef(0)
  /**
   * Fill, eyedropper and paste act on a *tap*: they wait for the finger to
   * lift, so a pinch that happens to start on the canvas never floods a
   * region or pastes. Cleared the moment a second finger lands.
   */
  const pendingTap = useRef<{ row: number; col: number } | null>(null)
  /**
   * Set when a painting tool is pressed with no color loaded yet: lifting the
   * finger opens the color chooser instead of painting nothing. A tap, like
   * fill, so a pinch never opens it.
   */
  const pendingColorRequest = useRef(false)

  const {
    patternId,
    technique,
    cols,
    rows,
    rounds,
    triangleUp,
    staggerPhase,
    cells,
    fringe,
    rowShape,
    loop,
    tool,
    slots,
    activeSlot,
    zoom,
    setZoom,
    fitZoomRequest,
    selection,
    colorSelectionMask,
    clipboard,
    pasteArmed,
    moveSource,
    pasteFlipH,
    pasteFlipV,
    toggleFlipH,
    toggleFlipV,
    setSelection,
    strokeStart,
    strokeCell,
    strokeKey,
    pickColorKey,
    floodFillKey,
    strokeEnd,
    strokeCancel,
    paintLine,
    pickColor,
    requestColor,
    floodFill,
    pasteClipboardAt,
    copySelection,
    armPaste,
    disarmPaste,
    showFringeDivider,
    fringeSculptMode,
    fringeSculptStart,
    fringeSculptSetColumn,
    fringeSculptEnd,
  } = useEditorStore()
  const colorLetters = usePatternLetterMap()
  // The right earring of a mirrored pair is a live reflection: shown, not
  // painted (the store ignores paint there). Say so instead of silently
  // swallowing the tap.
  const readOnlyMirror = useEditorStore((s) => s.side === 'right' && s.pair?.mode === 'mirror')
  const splitPairColors = useEditorStore((s) => s.splitPairColors)
  const letterVisibility = useEditorPrefsStore((s) => s.letterVisibility)

  const cellPx = BASE_CELL_PX * (zoom / 100)
  /**
   * El peyote triangular no es una grilla: son tres sectores en vueltas desde el
   * centro (ver `engine/trianglePeyote.ts`). Se dibuja en este mismo lienzo
   * para heredar el zoom, el pellizco y la mano, pero se salta todo lo que
   * habla de filas y columnas — regla, selección, flecos, argolla.
   */
  const esTriangulo = technique === 'triangle'
  const bodyBounds = gridBoundsUnits(technique, cols, rows)
  const bounds = esTriangulo
    ? triangleBoundsUnits(rounds, triangleUp)
    : gridBoundsUnits(technique, cols, rows, maxFringeLength(fringe))
  // The hanging loop sits *above* row 0, so it can't just widen the grid: it
  // pushes the whole body down instead. `MARGIN` stays the X origin, while
  // every Y coordinate — drawing and hit-testing alike — goes through
  // `originY`, so the two can never drift apart.
  const loopReservePx = loopReserveUnits(loop) * cellPx
  const originY = MARGIN + loopReservePx
  const canvasWidth = bounds.width * cellPx + MARGIN
  const canvasHeight = bounds.height * cellPx + originY

  /**
   * Opening framing: a strip (a bracelet, a band) is fitted to its width so
   * the beads stay big and legible and you scroll down through them, while
   * everything else keeps the whole-pattern framing it always had. See
   * `lib/fitZoom.ts` for the rule and why 41 rows at once is the wrong goal.
   *
   * Runs once per pattern opened — `framedPatternId` makes sure a zoom the
   * weaver sets afterwards is never overridden, and that simply editing the
   * pattern doesn't re-frame the canvas under her.
   */
  useEffect(() => {
    if (!patternId || framedPatternId.current === patternId) return
    const container = containerRef.current
    if (!container || container.clientWidth === 0) return
    framedPatternId.current = patternId
    skipZoomAnchor.current = true
    setZoom(
      initialFitZoom({
        boundsWidth: bounds.width,
        boundsHeight: bounds.height,
        viewportWidth: container.clientWidth,
        viewportHeight: container.clientHeight,
        margin: MARGIN,
      }),
    )
  }, [patternId, bounds.width, bounds.height, setZoom])

  /**
   * "Ajustar a pantalla" (`ZoomBar`): the opening framing again, on demand —
   * after pinching and panning around, one tap brings the whole pattern (or,
   * on a strip, its whole width) back into view.
   *
   * Deliberately does NOT skip the zoom anchoring below: the middle of the
   * view stays put, so fitting a long bracelet doesn't also throw her back to
   * row 1 of the chart she was in the middle of.
   */
  useEffect(() => {
    if (fitZoomRequest === fittedRequest.current) return
    fittedRequest.current = fitZoomRequest
    const container = containerRef.current
    if (!container || container.clientWidth === 0) return
    setZoom(
      initialFitZoom({
        boundsWidth: bounds.width,
        boundsHeight: bounds.height,
        viewportWidth: container.clientWidth,
        viewportHeight: container.clientHeight,
        margin: MARGIN,
      }),
    )
  }, [fitZoomRequest, bounds.width, bounds.height, setZoom])
  const activeColor = activeSlot >= 0 ? (slots[activeSlot] ?? null) : null

  /**
   * A trackpad pinch (which the browser reports as a wheel with ctrl held) or
   * ctrl/⌘ + mouse wheel zooms the chart around the pointer, instead of
   * zooming the whole page. A plain wheel keeps scrolling as it always did.
   * Registered by hand because React's wheel listener can't stop the page
   * zoom (it's passive).
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.01)))
      const next = clampZoom(Math.round(zoom * factor))
      if (next === zoom) return
      focusZoomAt(e.clientX, e.clientY)
      setZoom(next)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

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
    const y = (clientY - rect.top - originY) / cellPx
    return { x, y }
  }

  /** La mostacilla del peyote triangular bajo el puntero, o `null` si cayó en un hueco. */
  function beadFromEvent(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return triangleBeadAtCanvas(e.clientX - rect.left, e.clientY - rect.top, {
      rounds,
      pointingUp: triangleUp,
      cellPx,
      originX: MARGIN,
      originY,
    })
  }

  function cellFromEvent(e: { clientX: number; clientY: number }) {
    const { x, y } = toBeadUnits(e.clientX, e.clientY)
    return cellAtPositionWithFringe(technique, rows, x, y, staggerPhase)
  }

  /**
   * Drag-to-sculpt target: which column the pointer is over, and what fringe
   * length that implies — depth+1 for a point in the fringe zone, 0 if the
   * pointer is back up over the body (dragging up "erases" that column's
   * fringe). Reuses `cellAtPositionWithFringe`'s own row/col resolution so
   * this always agrees with how a tap would be read in either zone.
   */
  function fringeSculptTargetFromEvent(e: { clientX: number; clientY: number }) {
    const cell = cellFromEvent(e)
    const length = cell.row < rows ? 0 : cell.row - rows + 1
    return { col: cell.col, length }
  }

  function inBounds(row: number, col: number) {
    return isPaintableCell(row, col, cols, rows, fringe, rowShape)
  }

  /**
   * Marking is not painting: a selection is a rectangle over the chart, so it
   * may perfectly well cross a hollow of a shaped body (the empty corners of
   * a rhombus or a triangle) or the gaps between fringe strands. Only what's
   * actually there gets copied, moved or erased afterwards. Dragging used to
   * stop dead at the first cell the silhouette doesn't reach, which made it
   * impossible to mark, say, the top half of a rhombus to mirror it below.
   */
  function inGrid(row: number, col: number) {
    return row >= 0 && row < rows + maxFringeLength(fringe) && col >= 0 && col < cols
  }

  /** The nearest cell inside the chart — so a drag that wanders out of the grid keeps marking, instead of freezing. */
  function clampToGrid(cell: { row: number; col: number }) {
    return {
      row: Math.max(0, Math.min(rows + maxFringeLength(fringe) - 1, cell.row)),
      col: Math.max(0, Math.min(cols - 1, cell.col)),
    }
  }

  /** Marking tools work over the whole chart; the ones that put color on a bead don't. */
  function isMarkingTool() {
    return tool === 'select' || tool === 'rectErase'
  }

  /**
   * A touch screen has no pointer hovering over the chart, so after arming a
   * copy, a mirrored copy or a move there was nothing to see until the first
   * tap — which already dropped it. The ghost starts on the marked block's
   * own corner instead: on a phone or tablet the reflection appears right
   * over what it came from, and the first tap is a choice of where to leave
   * it, not a leap in the dark.
   */
  useEffect(() => {
    if (!pasteArmed || !clipboard) return
    setHoverCell((current) => current ?? (selection ? { row: selection.r0, col: selection.c0 } : null))
  }, [pasteArmed, clipboard, selection])

  // ---- rendering ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // A zoom keeps one point still: the one a pinch or the pointer asked for
    // (see `focusZoomAt`), or else — for the bar and the keyboard — the middle
    // of the view. Without it the canvas grew from its top-left corner and the
    // part being looked at slid off screen with every step.
    const container = containerRef.current
    const zoomChanged = drawnCellPx.current !== null && drawnCellPx.current !== cellPx
    if (zoomChanged && !zoomFocus.current && !skipZoomAnchor.current && container) {
      const c = container.getBoundingClientRect()
      focusZoomAt(c.left + c.width / 2, c.top + c.height / 2)
    }
    const anchor = zoomChanged ? zoomFocus.current : null
    zoomFocus.current = null
    if (drawnCellPx.current !== cellPx) skipZoomAnchor.current = false
    drawnCellPx.current = cellPx

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`
    if (container && anchor) {
      // Where that bead landed at the new size, and how far to scroll so it
      // sits back under the fingers / the pointer / the middle.
      const rect = canvas.getBoundingClientRect()
      container.scrollLeft += rect.left + MARGIN + anchor.bx * cellPx - anchor.toX
      container.scrollTop += rect.top + MARGIN + anchor.by * cellPx - anchor.toY
    }
    ctx.scale(dpr, dpr)

    const styles = getComputedStyle(canvas)
    const borderColor = styles.getPropertyValue('--nb-grid-line').trim() || '#3a3a3d'
    const emptyColor = styles.getPropertyValue('--nb-surface-3').trim() || '#2c2c2e'
    const textColor = styles.getPropertyValue('--nb-text-muted').trim() || '#a3a0a8'
    const panelColor = styles.getPropertyValue('--nb-surface').trim() || '#1c1c1e'
    const accent = '#c9a227'

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    if (esTriangulo) {
      drawTriangleCanvas(ctx, {
        rounds,
        pointingUp: triangleUp,
        cells,
        cellPx,
        originX: MARGIN,
        originY,
        emptyColor,
        borderColor,
        letters: shouldShowLetters(letterVisibility, cellPx) ? colorLetters : null,
        letterFontPx: letterFontSizePx(cellPx),
      })
      return
    }

    // rulers
    const maxFringe = maxFringeLength(fringe)
    ctx.fillStyle = textColor
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const colStep = cellPx < 10 ? 10 : cellPx < 16 ? 5 : 1
    for (let c = 0; c < cols; c += colStep) {
      const pos = cellPosition(technique, 0, c, undefined, staggerPhase)
      // Stays in the canvas's own top band (`MARGIN / 2`), above any loop reserve —
      // otherwise a loop's ring is drawn right over the middle column's number.
      ctx.fillText(String(c + 1), MARGIN + pos.x * cellPx + cellPx / 2, MARGIN / 2)
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < rows; r += colStep) {
      const pos = cellPosition(technique, r, 0, undefined, staggerPhase)
      ctx.fillText(String(r + 1), MARGIN - 6, originY + pos.y * cellPx + cellPx / 2)
    }
    // El fleco lleva su propia cuenta, que arranca de nuevo en 1: no son filas
    // del cuerpo, y seguir contando (11, 12, 13…) haría leer el fleco como si
    // el cuerpo continuara. Va en el dorado del fleco, igual que la línea
    // punteada que lo separa, porque si no las dos cuentas se leen como una
    // sola: "…5, 6, 1, 2" seguidos, con el mismo color, se confunden.
    if (maxFringe > 0) {
      ctx.fillStyle = accent
      for (let depth = 0; depth < maxFringe; depth += colStep) {
        const pos = cellPosition(technique, rows + depth, 0, rows, staggerPhase)
        ctx.fillText(String(depth + 1), MARGIN - 6, originY + pos.y * cellPx + cellPx / 2)
      }
      ctx.fillStyle = textColor
    }

    // The reference bead style, shared with the PNG, the card and the PDF — see lib/beadStyle.ts.
    const { inset, radius, width: beadW, height: beadH } = beadMetricsPx(cellPx, technique)
    // Every 5th/10th cell gets a bolder edge (like cross-stitch chart
    // counting guides), so large grids stay readable and easy to click
    // precisely without losing count.
    const groupStep = cellPx < 12 ? 10 : 5
    // 'auto' hides the letters once cells get too small to read them; the
    // weaver can force them on or off from the toolbar. See lib/letterVisibility.ts.
    const showLetters = shouldShowLetters(letterVisibility, cellPx)
    if (showLetters) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `600 ${letterFontSizePx(cellPx)}px system-ui, sans-serif`
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // A shaped (triangle/rhombus) row simply has no cell here — skip drawing anything at all
        // (not even an empty placeholder) so the silhouette itself is what the canvas shows.
        if (!isPaintableCell(row, col, cols, rows, undefined, rowShape)) continue
        const pos = cellPosition(technique, row, col, undefined, staggerPhase)
        const x = MARGIN + pos.x * cellPx + inset
        const y = originY + pos.y * cellPx + inset
        const w = beadW
        const h = beadH
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
          const letter = colorLetters.get(hex)
          if (letter) {
            ctx.fillStyle = contrastTextColor(hex)
            ctx.fillText(letter, x + w / 2, y + h / 2 + 0.5)
          }
        }
      }
    }

    // fringe zone — a seamless continuation of the body (same cell size,
    // same row pitch via cellPosition's bodyRows branch, no gap, no opacity
    // change). The only body/fringe marker is an optional thin dashed guide
    // line, editor-only (see showFringeDivider in FringePanel) — it never
    // appears in PDF/PNG/Instagram-card exports, which share this same
    // per-cell drawing logic with no divider at all. The turn bead (where
    // the thread turns back up) has no visual distinction here either — it
    // reads as a bead like any other; its own toggle lives in FringePanel.
    if (maxFringe > 0) {
      for (let col = 0; col < cols; col++) {
        const length = fringe.lengths[col] ?? 0
        for (let depth = 0; depth < length; depth++) {
          const row = rows + depth
          const pos = cellPosition(technique, row, col, rows, staggerPhase)
          const x = MARGIN + pos.x * cellPx + inset
          const y = originY + pos.y * cellPx + inset
          const w = beadW
          const h = beadH
          const hex = cells[cellKey(row, col)]

          ctx.beginPath()
          roundRect(ctx, x, y, w, h, radius)
          ctx.fillStyle = hex ?? emptyColor
          ctx.fill()
          ctx.strokeStyle = borderColor
          ctx.lineWidth = 1
          ctx.stroke()

          if (hex && showLetters) {
            const letter = colorLetters.get(hex)
            if (letter) {
              ctx.fillStyle = contrastTextColor(hex)
              ctx.fillText(letter, x + w / 2, y + h / 2 + 0.5)
            }
          }
        }
      }

      // Drawn last (after every body and fringe cell above), so it crosses
      // in front of the beads instead of hiding behind them — previously
      // this ran before the fringe loop, so it only ever showed through the
      // gaps between beads and at the canvas edges.
      if (showFringeDivider) {
        // Brand gold rather than the neutral grid-line gray: it needs to
        // read clearly as "here's where the fringe starts" against both
        // themes without competing with the beads themselves — 0.75 alpha
        // keeps it a hair short of full saturation (gold at 100% opacity
        // on a dark canvas background reads as oversaturated/glowing).
        const dividerY = originY + bodyBounds.height * cellPx
        ctx.setLineDash([4, 3])
        // A gold-on-gold bead would otherwise make the dash disappear
        // entirely (same color drawn over itself) — a thin halo in the
        // panel's own background color first gives the dash an edge that
        // reads against any bead color underneath, gold included.
        ctx.strokeStyle = panelColor
        ctx.globalAlpha = 0.9
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(MARGIN, dividerY)
        ctx.lineTo(canvasWidth, dividerY)
        ctx.stroke()
        ctx.strokeStyle = accent
        ctx.globalAlpha = 0.75
        ctx.lineWidth = 1.75
        ctx.beginPath()
        ctx.moveTo(MARGIN, dividerY)
        ctx.lineTo(canvasWidth, dividerY)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
    }

    // Hanging loop, in the space reserved above row 0. Its beads are a ring,
    // not grid cells — they live in `loop`, never in `cells`, so they're drawn
    // here rather than in the loops above and aren't paintable or hit-testable.
    // Same geometry as the PDF/PNG exports (loopAnchorX + loopBeadOffsets), so
    // what the editor shows is what gets exported.
    if (loop) {
      const anchorXUnits = loopAnchorX(technique, cols, rowShape, staggerPhase)
      const gridOrigin = cellPosition(technique, 0, 0, rows, staggerPhase)
      const anchorX = MARGIN + (anchorXUnits - gridOrigin.x) * cellPx

      if (loop.variant === 'woven') {
        const beadRadius = cellPx * 0.42
        for (const { dx, dy } of loopBeadOffsets(loopBeadCount(loop))) {
          const cx = anchorX + dx * cellPx
          const cy = originY + dy * cellPx
          ctx.beginPath()
          ctx.arc(cx, cy, beadRadius, 0, Math.PI * 2)
          ctx.fillStyle = loop.color
          ctx.fill()
          ctx.strokeStyle = borderColor
          ctx.lineWidth = 1
          ctx.stroke()
          if (showLetters) {
            const letter = colorLetters.get(loop.color)
            if (letter) {
              ctx.fillStyle = contrastTextColor(loop.color)
              ctx.fillText(letter, cx, cy + 0.5)
            }
          }
        }
      } else {
        // Metal: a bought finding, so no beads — just a discreet open ring.
        const outer = (METAL_LOOP_INDICATOR_UNITS / 2) * cellPx
        ctx.beginPath()
        ctx.arc(anchorX, originY - outer, outer * 0.78, 0, Math.PI * 2)
        ctx.strokeStyle = textColor
        ctx.lineWidth = Math.max(1, cellPx * 0.14)
        ctx.stroke()
        ctx.lineWidth = 1
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
        const pos = cellPosition(technique, targetRow, targetCol, rows, staggerPhase)
        ctx.beginPath()
        roundRect(
          ctx,
          MARGIN + pos.x * cellPx + inset,
          originY + pos.y * cellPx + inset,
          beadW,
          beadH,
          radius,
        )
        ctx.fillStyle = hex
        ctx.fill()
      }
      ctx.globalAlpha = 1
      const origin = cellPosition(technique, hoverCell.row, hoverCell.col, rows, staggerPhase)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 3])
      ctx.strokeRect(
        MARGIN + origin.x * cellPx,
        originY + origin.y * cellPx,
        clipboard.width * cellPx,
        clipboard.height * cellPx,
      )
      ctx.setLineDash([])
    } else if (hoverCell && inBounds(hoverCell.row, hoverCell.col) && !isPointerDown.current) {
      // hover highlight — shows exactly which cell a click will affect, so
      // targeting a specific bead on a dense grid stays easy on touch and mouse
      const pos = cellPosition(technique, hoverCell.row, hoverCell.col, rows, staggerPhase)
      const x = MARGIN + pos.x * cellPx
      const y = originY + pos.y * cellPx
      ctx.fillStyle = 'rgba(201, 162, 39, 0.18)'
      ctx.fillRect(x, y, cellPx, cellPx)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 0.75, y + 0.75, cellPx - 1.5, cellPx - 1.5)
    }

    // selection overlay
    if (selection) {
      // A color selection almost never fills its own bounding box — highlight
      // exactly the matched cells first, so the dashed rect below reads as
      // "this is the extent", not "this whole box is selected".
      if (colorSelectionMask) {
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.25
        for (const key of colorSelectionMask) {
          const { row, col } = parseCellKey(key)
          const pos = cellPosition(technique, row, col, rows, staggerPhase)
          ctx.fillRect(MARGIN + pos.x * cellPx, originY + pos.y * cellPx, cellPx, cellPx)
        }
        ctx.globalAlpha = 1
      }

      const p0 = cellPosition(technique, selection.r0, selection.c0, rows, staggerPhase)
      const p1 = cellPosition(technique, selection.r1, selection.c1, rows, staggerPhase)
      const x0 = MARGIN + Math.min(p0.x, p1.x) * cellPx
      const y0 = originY + Math.min(p0.y, p1.y) * cellPx
      const w = (Math.max(p0.x, p1.x) - Math.min(p0.x, p1.x) + 1) * cellPx
      const h = (Math.max(p0.y, p1.y) - Math.min(p0.y, p1.y) + 1) * cellPx
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(x0, y0, w, h)
      ctx.setLineDash([])
    }

    // line preview
    if (tool === 'line' && lineStart && hoverCell && activeColor) {
      for (const c of lineCells(lineStart.row, lineStart.col, hoverCell.row, hoverCell.col)) {
        if (!inBounds(c.row, c.col)) continue
        const pos = cellPosition(technique, c.row, c.col, rows, staggerPhase)
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        roundRect(ctx, MARGIN + pos.x * cellPx + inset, originY + pos.y * cellPx + inset, beadW, beadH, radius)
        ctx.fillStyle = activeColor
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // keyboard focus ring
    if (inBounds(focusCell.row, focusCell.col)) {
      const pos = cellPosition(technique, focusCell.row, focusCell.col, rows, staggerPhase)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(MARGIN + pos.x * cellPx, originY + pos.y * cellPx, cellPx, cellPx)
    }
  }, [
    technique,
    cols,
    rows,
    staggerPhase,
    cells,
    fringe,
    rowShape,
    loop,
    zoom,
    originY,
    showFringeDivider,
    selection,
    colorSelectionMask,
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
    letterVisibility,
    esTriangulo,
    rounds,
    triangleUp,
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
      if (isFringeSculpting.current) fringeSculptEnd()
      else if (isPointerDown.current && (tool === 'pencil' || tool === 'eraser')) {
        if (performance.now() - strokeStartedAt.current < PINCH_GRACE_MS) strokeCancel()
        else strokeEnd()
      } else if (isPointerDown.current) setSelection(null)
      pendingTap.current = null
      pendingColorRequest.current = false
      isPointerDown.current = false
      isFringeSculpting.current = false
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

    /**
     * "Mover el gráfico": with the hand chosen, one finger drags the chart
     * instead of painting — a pattern zoomed in past the screen used to need
     * two fingers to move, which on a phone means putting down the needle.
     *
     * A paste waiting to be dropped still wins: the hand must never leave her
     * with something armed and no way to let go of it.
     */
    if (tool === 'pan' && !pasteArmed) {
      try {
        ;(e.target as Element).setPointerCapture(e.pointerId)
      } catch {
        // ignore — capture is a nice-to-have (keeps dragging past the canvas edge), not required
      }
      panFrom.current = { x: e.clientX, y: e.clientY }
      isPointerDown.current = true
      return
    }

    /**
     * El peyote triangular: lápiz, goma y cuentagotas sobre una mostacilla, sin
     * filas ni columnas. El pellizco y la mano de más arriba ya pasaron, así
     * que se mueve y se acerca igual que el peyote.
     */
    if (esTriangulo) {
      const bead = beadFromEvent(e)
      if (!bead) return
      try {
        ;(e.target as Element).setPointerCapture(e.pointerId)
      } catch {
        // ignore — capture is a nice-to-have (keeps painting past the canvas edge), not required
      }
      const key = triangleKey(bead)
      const borrando = tool === 'eraser'
      if (!borrando && !activeColor && tool !== 'eyedropper') {
        pendingColorRequest.current = true
        return
      }
      // El cuentagotas y el balde actúan al *levantar* el dedo, como en la
      // grilla: así un pellizco que empieza sobre el gráfico nunca pinta.
      if (tool === 'eyedropper' || tool === 'fill') {
        pendingBeadTap.current = key
        return
      }
      strokeStartedAt.current = performance.now()
      strokeStart()
      strokeKey(key, borrando ? null : activeColor)
      lastBeadKey.current = key
      isPointerDown.current = true
      return
    }

    if (fringeSculptMode) {
      try {
        ;(e.target as Element).setPointerCapture(e.pointerId)
      } catch {
        // ignore — capture is a nice-to-have, not required for sculpting to work
      }
      const { col, length } = fringeSculptTargetFromEvent(e)
      if (col < 0 || col >= cols) return
      fringeSculptStart()
      fringeSculptSetColumn(col, length)
      isFringeSculpting.current = true
      isPointerDown.current = true
      return
    }

    const raw = cellFromEvent(e)
    const cell = isMarkingTool() ? clampToGrid(raw) : raw
    // A paste can legitimately start on a hollow of a shaped body — only the
    // beads that land inside the silhouette are kept (see `pasteClipboardAt`).
    const reachable = isMarkingTool() || (pasteArmed && clipboard ? inGrid(raw.row, raw.col) : inBounds(cell.row, cell.col))
    if (!reachable) return
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {
      // ignore — capture is a nice-to-have (keeps dragging past canvas edges), not required for painting to work
    }

    if (pasteArmed && clipboard) {
      pendingTap.current = cell
      return
    }

    if (!activeColor && (tool === 'pencil' || tool === 'line' || tool === 'fill')) {
      pendingColorRequest.current = true
      return
    }

    switch (tool) {
      case 'pencil':
        strokeStartedAt.current = performance.now()
        strokeStart()
        strokeCell(cell.row, cell.col, activeColor)
        lastCell.current = cell
        isPointerDown.current = true
        break
      case 'eraser':
        strokeStartedAt.current = performance.now()
        strokeStart()
        strokeCell(cell.row, cell.col, null)
        lastCell.current = cell
        isPointerDown.current = true
        break
      case 'eyedropper':
      case 'fill':
        pendingTap.current = cell
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
      const next = clampZoom(Math.round(pinch.current.startZoom * scale))
      const container = containerRef.current
      if (next !== zoom) {
        // Zoom and pan in one go: the redraw puts the point that was under
        // the fingers where the fingers are now.
        focusZoomAt(pinch.current.midX, pinch.current.midY, mid.x, mid.y)
        setZoom(next)
      } else if (container) {
        container.scrollLeft -= mid.x - pinch.current.midX
        container.scrollTop -= mid.y - pinch.current.midY
      }
      pinch.current.midX = mid.x
      pinch.current.midY = mid.y
      return
    }
    if (activePointers.current.size >= 2) return

    // La mano no pinta ni resalta la mostacilla de abajo: sólo arrastra.
    if (tool === 'pan' && !pasteArmed) {
      const container = containerRef.current
      if (panFrom.current && container) {
        container.scrollLeft -= e.clientX - panFrom.current.x
        container.scrollTop -= e.clientY - panFrom.current.y
        panFrom.current = { x: e.clientX, y: e.clientY }
      }
      return
    }

    if (esTriangulo) {
      if (!isPointerDown.current) return
      if (tool !== 'pencil' && tool !== 'eraser') return
      const bead = beadFromEvent(e)
      if (!bead) return
      const key = triangleKey(bead)
      if (lastBeadKey.current === key) return
      strokeKey(key, tool === 'eraser' ? null : activeColor)
      lastBeadKey.current = key
      return
    }

    if (isFringeSculpting.current) {
      const { col, length } = fringeSculptTargetFromEvent(e)
      if (col >= 0 && col < cols) fringeSculptSetColumn(col, length)
      return
    }

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

    if (isMarkingTool()) {
      const to = clampToGrid(cell)
      setSelection({ r0: selection?.r0 ?? to.row, c0: selection?.c0 ?? to.col, r1: to.row, c1: to.col })
      return
    }
    if (!inBounds(cell.row, cell.col)) return

    if (tool === 'pencil' || tool === 'eraser') {
      if (lastCell.current && lastCell.current.row === cell.row && lastCell.current.col === cell.col) return
      strokeCell(cell.row, cell.col, tool === 'pencil' ? activeColor : null)
      lastCell.current = cell
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) pinch.current = null
    if (activePointers.current.size >= 1) return // still mid-pinch (or settling back to one finger): don't treat as a draw release

    if (panFrom.current) {
      panFrom.current = null
      isPointerDown.current = false
      return
    }

    if (pendingColorRequest.current) {
      pendingColorRequest.current = false
      requestColor()
      return
    }

    if (esTriangulo) {
      const beadTap = pendingBeadTap.current
      pendingBeadTap.current = null
      if (beadTap) {
        if (tool === 'eyedropper') pickColorKey(beadTap)
        else if (tool === 'fill') floodFillKey(beadTap, activeColor)
        return
      }
      if (isPointerDown.current) strokeEnd()
      isPointerDown.current = false
      lastBeadKey.current = null
      return
    }

    const tap = pendingTap.current
    pendingTap.current = null
    if (tap) {
      if (pasteArmed && clipboard) pasteClipboardAt(tap.row, tap.col, { flipH: pasteFlipH, flipV: pasteFlipV })
      else if (tool === 'fill') floodFill(tap.row, tap.col, activeColor)
      else if (tool === 'eyedropper') pickColor(tap.row, tap.col)
      return
    }

    if (isFringeSculpting.current) {
      fringeSculptEnd()
      isFringeSculpting.current = false
      isPointerDown.current = false
      return
    }

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
    } else if (tool === 'rectErase' && isPointerDown.current) {
      // Only after a real one-finger drag — not when the last finger of a pinch lifts.
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
      if (tool !== 'eraser' && !activeColor) {
        requestColor()
        return
      }
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
      {readOnlyMirror && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-surface-2/95 py-1 pl-4 pr-1 text-xs font-medium shadow-sm backdrop-blur">
          <span>{t.editor.pair.readOnly}</span>
          <button
            onClick={splitPairColors}
            className="rounded-full bg-accent-500 px-3 py-1 font-semibold text-accent-ink hover:bg-accent-400"
          >
            {t.editor.pair.editSeparately}
          </button>
        </div>
      )}
      {!readOnlyMirror && pasteArmed && clipboard && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-2/90 px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          {moveSource ? t.editor.moveHint : t.editor.pasteHint}
        </div>
      )}
      {/* Un patrón recién creado no tiene colores cargados: dice por dónde empezar. */}
      {!readOnlyMirror && !pasteArmed && slots.every((hex) => !hex) && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-2/95 px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          {t.editor.tray.firstColorHint}
        </div>
      )}
      {!pasteArmed && tool === 'line' && lineStart && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-2/90 px-4 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          Toca otra celda para terminar la línea · Esc cancelar
        </div>
      )}
      <div
        ref={containerRef}
        className="no-scrollbar h-full w-full overflow-auto bg-canvas p-4"
        tabIndex={0}
        role="grid"
        aria-label={t.editor.canvasLabel}
        onKeyDown={handleKeyDown}
      >
        {/* Centred while it fits, and as wide as the chart once it doesn't: a
            plain flex centre let a zoomed-in chart spill past the LEFT edge,
            where no scroll can reach — the first columns were simply out of
            reach on a big pattern. */}
        <div className="flex h-max min-h-full w-max min-w-full items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => setHoverCell(null)}
            className={`touch-none ${tool === 'pan' && !pasteArmed ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
          />
        </div>
      </div>
    </div>
  )
}

