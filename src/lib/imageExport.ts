import type { BeadTypeDef, ColorMap, FringeData, Technique } from '@/engine/types'
import { cellPosition, gridBoundsUnits } from '@/engine/geometry'
import { maxFringeLength } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { paletteFromCells, letterForIndex } from './palette'
import { contrastTextColor } from './color'

export interface ExportImageOptions {
  name: string
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  /** Absent/undefined is treated as "no fringe" — see `engine/fringe.ts`. */
  fringe?: FringeData
  beadType: BeadTypeDef
  /** Draw the materials-list letter (A/B/C…) inside each bead, colored for contrast. Default true. */
  showLetters?: boolean
}

const MIN_CELL_PX = 10
const MAX_CELL_PX = 64

/**
 * Pixel size of one bead-unit cell for a canvas export, sized so the
 * pattern's longer side lands near `targetLongSidePx`, clamped to
 * [MIN_CELL_PX, MAX_CELL_PX] so a tiny pattern doesn't render as a handful
 * of giant blocks and a huge one doesn't blow up canvas memory.
 */
export function computeExportCellPx(boundsWidth: number, boundsHeight: number, targetLongSidePx: number): number {
  const longSideUnits = Math.max(boundsWidth, boundsHeight, 1)
  return Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, targetLongSidePx / longSideUnits))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Renders the pattern (body + fringe, letters for contrast) onto a fresh
 * offscreen canvas — the shared drawing core for both the plain high-res
 * export and the Instagram card composition. Only painted cells are drawn
 * (an uncolored bead shows the given `backgroundHex` through), matching
 * `PatternThumb`'s convention — this is a shareable graphic, not a working
 * chart, so a half-finished pattern shouldn't be cluttered with empty-slot
 * outlines.
 *
 * `targetLongSidePx` sizes the cell so the pattern's longer side lands near
 * that many pixels, clamped to [MIN_CELL_PX, MAX_CELL_PX] per cell so a tiny
 * pattern doesn't render as a handful of giant blocks and a huge one doesn't
 * blow up canvas memory.
 */
export function renderPatternCanvas(
  opts: ExportImageOptions,
  backgroundHex: string,
  targetLongSidePx: number,
): HTMLCanvasElement {
  const { technique, cols, rows, cells, fringe } = opts
  const bounds = gridBoundsUnits(technique, cols, rows, maxFringeLength(fringe))
  const cellPx = computeExportCellPx(bounds.width, bounds.height, targetLongSidePx)
  const margin = cellPx * 0.6
  const width = Math.ceil(bounds.width * cellPx + margin * 2)
  const height = Math.ceil(bounds.height * cellPx + margin * 2)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = backgroundHex
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const palette = paletteFromCells(cells)
  const letterForHex = new Map(palette.map((p, i) => [p.hex, letterForIndex(i)]))
  const showLetters = (opts.showLetters ?? true) && cellPx >= 16

  const radius = Math.max(1, cellPx * 0.12)
  const inset = Math.max(0.5, cellPx * 0.05)
  if (showLetters) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${Math.max(9, cellPx * 0.42)}px system-ui, sans-serif`
  }

  function drawCell(context: CanvasRenderingContext2D, row: number, col: number) {
    const hex = cells[cellKey(row, col)]
    if (!hex) return
    const pos = cellPosition(technique, row, col, rows)
    const x = margin + pos.x * cellPx + inset
    const y = margin + pos.y * cellPx + inset
    const w = cellPx - inset * 2
    const h = cellPx - inset * 2

    context.beginPath()
    roundRect(context, x, y, w, h, radius)
    context.fillStyle = hex
    context.fill()

    if (showLetters) {
      const letter = letterForHex.get(hex)
      if (letter) {
        context.fillStyle = contrastTextColor(hex)
        context.fillText(letter, x + w / 2, y + h / 2 + 0.5)
      }
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) drawCell(ctx, row, col)
  }
  for (let col = 0; col < cols; col++) {
    const length = fringe?.lengths[col] ?? 0
    for (let depth = 0; depth < length; depth++) drawCell(ctx, rows + depth, col)
  }

  return canvas
}
