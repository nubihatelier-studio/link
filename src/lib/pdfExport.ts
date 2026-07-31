import type { ColorMap, FringeData, LoopData, RowShape, Technique } from '@/engine/types'
import type { BeadTypeDef } from '@/engine/types'
import type { jsPDF as JsPDF } from 'jspdf'
import { cellPosition, physicalSizeMm, beadCount, loopAnchorX } from '@/engine/geometry'
import { isPaintableCell, maxFringeLength, totalFringeBeadCount } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits, METAL_LOOP_INDICATOR_UNITS } from '@/engine/loop'
import { paletteFromCells, letterForIndex } from './palette'
import { catalogMatchForHex, contrastTextColor } from './color'
import { estimateThreadMeters, suggestedNeedle } from './materials'
import { t } from '@/i18n/es'

export interface ExportPatternOptions {
  name: string
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  beadType: BeadTypeDef
  /** Absent/undefined is treated as "no fringe" — see `engine/fringe.ts`. */
  fringe?: FringeData
  /** Absent/undefined is treated as a full rectangle — see `engine/shape.ts`. */
  rowShape?: RowShape[]
  /** Absent/undefined defaults to 0 — see `engine/geometry.ts#cellPosition`. */
  staggerPhase?: 0 | 1
  /** Free-text note — printed in the ficha page's notes area instead of blank handwriting lines when present. */
  note?: string
  /** Hanging loop at the top tip — see `engine/types.ts#LoopData`. Absent = no loop. */
  loop?: LoopData
  /** Draw the materials-list letter (A/B/C…) inside each bead, colored for contrast. Default true — without it the chart is unreadable in B/W print or with similar-looking colors. */
  showLetters?: boolean
}

/**
 * Legible chart cell size in mm, tuned per technique — intentionally NOT the
 * bead's real physical size (a Delica 11/0 is ~1.6mm, unreadable at 1:1).
 * Proportions ported from the Lovable build's `baseBeadPx` (peyote tall,
 * brick wide, loom square); the bead's *actual* physical size is still shown
 * separately in the spec line via `physicalSizeMm`.
 *
 * This is the size used when it fits — see `fitChartCellToOnePage`, which
 * shrinks below it only when needed so the whole chart (body + fringe)
 * always renders on a single page.
 */
export function chartCellMm(technique: Technique): { w: number; h: number } {
  if (technique === 'peyote') return { w: 3.2, h: 3.9 }
  if (technique === 'brick') return { w: 3.9, h: 3.2 }
  return { w: 3.5, h: 3.5 }
}

const MAX_LETTER_FONT_SIZE = 5.5
/** Below this cell size, a materials-list letter wouldn't be legible anyway — hidden regardless of the `showLetters` toggle. */
const MIN_LEGIBLE_CELL_MM = 2.2

/**
 * Minimum on-page distance (mm) between two consecutive ruler numbers
 * before they start reading as one smudge instead of two digits — the
 * labels are single/double-digit numbers at a small fixed 6pt font
 * (~2.1mm cap height), so ~4mm of pitch leaves a legible gap between them
 * even at two digits wide.
 */
const MIN_LABEL_GAP_MM = 4

/**
 * The row/column interval to draw ruler numbers at, given how many units
 * there are and the on-page size (mm) of one unit ("cell") along that axis.
 * Row and column intervals must be computed independently — a narrow, tall
 * pattern (say 6 columns × 37 rows) can have plenty of room to number every
 * column while its rows, at the same cell height, still need a much coarser
 * interval. The previous version derived a single interval from the column
 * count alone and reused it for rows too, which numbered every row of a
 * tall pattern and produced overlapping labels.
 *
 * Always resolves to a round number (1, 5, 10, 25, 50, …) — never an
 * arbitrary interval like "7" — picking the coarsest one that still keeps
 * consecutive labels at least `MIN_LABEL_GAP_MM` apart.
 */
export function rulerLabelStep(count: number, cellSizeMm: number): number {
  if (count <= 0 || cellSizeMm <= 0) return 1
  const minStep = MIN_LABEL_GAP_MM / cellSizeMm
  const roundSteps = [1, 5, 10, 25, 50, 100, 250, 500, 1000]
  for (const candidate of roundSteps) {
    if (candidate >= minStep) return candidate
  }
  return roundSteps[roundSteps.length - 1]
}

/**
 * The actual 0-based indices to draw a ruler number at: every `step`-th one
 * (see `rulerLabelStep`), always including the very first (0) and very last
 * (`count - 1`) — a weaver should always be able to see exactly where a row
 * or column starts and ends, even when it doesn't fall on a round number.
 *
 * When `count - 1` doesn't land on a round step, the last regular label can
 * end up closer to it than `MIN_LABEL_GAP_MM` allows (e.g. step 10 over 37
 * units labels 0, 10, 20, 30, then forcing 36 too would put two labels only
 * 6 units apart) — in that case the next-to-last regular label is dropped
 * so the "always show the last index" guarantee never itself creates the
 * crowding this function exists to prevent. The one exception is index 0
 * itself, which is never dropped — showing the first and last index always
 * wins over the spacing minimum on a range so small that even they can't be
 * `MIN_LABEL_GAP_MM` apart (e.g. 4 units at a tiny cell size).
 */
export function rulerLabelIndices(count: number, cellSizeMm: number): number[] {
  if (count <= 0) return []
  const step = rulerLabelStep(count, cellSizeMm)
  const indices: number[] = []
  for (let i = 0; i < count - 1; i += step) indices.push(i)
  const minGapUnits = cellSizeMm > 0 ? MIN_LABEL_GAP_MM / cellSizeMm : 0
  if (indices.length > 1 && count - 1 - indices[indices.length - 1] < minGapUnits) indices.pop()
  indices.push(count - 1)
  return indices
}

/**
 * Shrinks `base` (keeping its per-technique aspect ratio) just enough that
 * the whole `cols` × `totalRows` grid fits within `availW` × `availH` — never
 * grows past the legible base size, only shrinks when the pattern (body +
 * fringe) would otherwise need more than one page. The chart always renders
 * on a single page; see `exportPatternToPdf`.
 */
export function fitChartCellToOnePage(
  base: { w: number; h: number },
  cols: number,
  totalRows: number,
  availW: number,
  availH: number,
): { w: number; h: number } {
  const scale = Math.min(1, availW / (cols * base.w), availH / (totalRows * base.h))
  return { w: base.w * scale, h: base.h * scale }
}

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
/** Gap between the chart and materials columns in the one-page layout. */
const COLUMN_GUTTER_MM = 10
/** Y position where content below the title + spec line starts — matches the fixed positions `drawHeaderBlock` draws at (16, 23), same convention the ficha page always used. */
const HEADER_BOTTOM_MM = 30
const FOOTER_RESERVE_MM = 10

export interface OnePageLayout {
  orientation: 'portrait' | 'landscape'
  cellW: number
  cellH: number
}

/**
 * A one-page candidate for a given orientation, or null when the chart
 * doesn't fit a single column at its full, legible base cell size (see
 * `chartCellMm`). Deliberately never shrinks the cell to make it fit — a
 * chart that already needs shrinking to fit a half-width column reads
 * better spread across the whole page in the paginated fallback instead of
 * squeezed even smaller next to the materials column.
 */
function onePageCandidate(
  orientation: 'portrait' | 'landscape',
  base: { w: number; h: number },
  cols: number,
  totalRows: number,
  margin: number,
): OnePageLayout | null {
  const pageWidth = orientation === 'portrait' ? A4_WIDTH_MM : A4_HEIGHT_MM
  const pageHeight = orientation === 'portrait' ? A4_HEIGHT_MM : A4_WIDTH_MM
  const columnWidth = (pageWidth - margin * 2 - COLUMN_GUTTER_MM) / 2
  const columnHeight = pageHeight - margin - HEADER_BOTTOM_MM - FOOTER_RESERVE_MM
  if (cols * base.w > columnWidth || totalRows * base.h > columnHeight) return null
  return { orientation, cellW: base.w, cellH: base.h }
}

/**
 * Picks the one-page (chart + materials side by side) layout when the chart
 * fits a single column at full legible size — portrait preferred, falling
 * back to landscape for patterns that are too wide for a portrait column
 * but fit a landscape one (e.g. a wide, short loom piece). Returns null when
 * neither orientation fits the chart at full size — the caller falls back
 * to the paginated ficha + full-page-chart layout instead, which was always
 * this app's layout before the one-page design existed, and which always
 * has more room to shrink into than a half-width column ever would.
 */
export function chooseOnePageLayout(
  base: { w: number; h: number },
  cols: number,
  totalRows: number,
  margin: number,
): OnePageLayout | null {
  return (
    onePageCandidate('portrait', base, cols, totalRows, margin) ??
    onePageCandidate('landscape', base, cols, totalRows, margin)
  )
}

/**
 * Draws the whole cols × totalRows chart (body + fringe) as PDF vector
 * primitives, with the materials-list letter inside every colored cell (when
 * the cell is large enough to read one) so the chart stays legible printed
 * in black & white or with visually similar colors.
 */
function drawChart(
  doc: JsPDF,
  opts: ExportPatternOptions,
  totalRows: number,
  letterForHex: Map<string, string>,
  showLetters: boolean,
  originX: number,
  originY: number,
  cellW: number,
  cellH: number,
): void {
  const { technique, cells, cols, rows, fringe, rowShape, staggerPhase = 0 } = opts
  const origin = cellPosition(technique, 0, 0, rows, staggerPhase)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(120)
  for (const c of rulerLabelIndices(cols, cellW)) {
    const pos = cellPosition(technique, 0, c, rows, staggerPhase)
    doc.text(String(c + 1), originX + (pos.x - origin.x) * cellW + cellW / 2, originY - 2, { align: 'center' })
  }
  for (const r of rulerLabelIndices(totalRows, cellH)) {
    const pos = cellPosition(technique, r, 0, rows, staggerPhase)
    // baseline: 'middle' derives the vertical centering from the font's own metrics — a fixed
    // mm offset (the previous approach) doesn't scale with cell size and visibly drifts off the
    // row at small cell sizes (a 1mm constant is half a bead at a ~2mm cell).
    doc.text(String(r + 1), originX - 2, originY + (pos.y - origin.y) * cellH + cellH / 2, {
      align: 'right',
      baseline: 'middle',
    })
  }

  const minCell = Math.min(cellW, cellH)
  const lettersVisible = showLetters && minCell >= MIN_LEGIBLE_CELL_MM
  const letterFontSize = Math.min(MAX_LETTER_FONT_SIZE, minCell * 1.6)

  doc.setLineWidth(0.05)
  for (let row = 0; row < totalRows; row++) {
    for (let col = 0; col < cols; col++) {
      // Skip a "cell" past that column's own fringe length, or outside a shaped row's own span —
      // it doesn't exist (columns can have different fringe lengths, and a shaped body's rows can
      // be narrower than `cols`, so not every (row, col) in this rectangle is a real bead).
      if (!isPaintableCell(row, col, cols, rows, fringe, rowShape)) continue

      const hex = cells[cellKey(row, col)]
      const pos = cellPosition(technique, row, col, rows, staggerPhase)
      const x = originX + (pos.x - origin.x) * cellW
      const y = originY + (pos.y - origin.y) * cellH

      if (hex) {
        doc.setFillColor(hex)
        doc.setDrawColor(200)
        doc.rect(x, y, cellW, cellH, 'FD')
        if (lettersVisible) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(letterFontSize)
          doc.setTextColor(contrastTextColor(hex))
          doc.text(letterForHex.get(hex) ?? '?', x + cellW / 2, y + cellH / 2, { align: 'center', baseline: 'middle' })
        }
      } else {
        doc.setDrawColor(200)
        doc.rect(x, y, cellW, cellH, 'S')
      }
    }
  }
  doc.setTextColor(0)
}

/**
 * Draws a woven hanging loop's ring above the body's top tip — circles
 * rather than squares, so it reads as a distinct "ring" instead of another
 * row of the chart, but otherwise the same per-technique anchor
 * (`loopAnchorX`, shared with the editor canvas/PNG/Instagram card) and
 * letter-for-contrast treatment as every body/fringe cell.
 */
function drawLoop(
  doc: JsPDF,
  opts: ExportPatternOptions,
  loop: LoopData,
  letterForHex: Map<string, string>,
  showLetters: boolean,
  originX: number,
  bodyTopY: number,
  cellW: number,
  cellH: number,
): void {
  const anchorXUnits = loopAnchorX(opts.technique, opts.cols, opts.rowShape, opts.staggerPhase ?? 0)
  const origin = cellPosition(opts.technique, 0, 0, opts.rows, opts.staggerPhase ?? 0)
  const anchorX = originX + (anchorXUnits - origin.x) * cellW

  const minCell = Math.min(cellW, cellH)
  const radius = minCell * 0.42
  const lettersVisible = showLetters && minCell >= MIN_LEGIBLE_CELL_MM
  const letterFontSize = Math.min(MAX_LETTER_FONT_SIZE, minCell * 1.6)

  // Metal: no beads at all, just a discreet open ring standing in for the
  // bought finding (it's listed in the materials column either way).
  if (loop.variant === 'metal') {
    const outer = (METAL_LOOP_INDICATOR_UNITS / 2) * cellH
    doc.setDrawColor(150)
    doc.setLineWidth(Math.max(0.2, minCell * 0.12))
    doc.circle(anchorX, bodyTopY - outer, outer * 0.78, 'S')
    doc.setLineWidth(0.2)
    doc.setDrawColor(0)
    return
  }

  doc.setDrawColor(200)
  for (const { dx, dy } of loopBeadOffsets(loop.beadCount)) {
    const cx = anchorX + dx * cellW
    const cy = bodyTopY + dy * cellH
    doc.setFillColor(loop.color)
    doc.circle(cx, cy, radius, 'FD')
    if (lettersVisible) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(letterFontSize)
      doc.setTextColor(contrastTextColor(loop.color))
      doc.text(letterForHex.get(loop.color) ?? '?', cx, cy, { align: 'center', baseline: 'middle' })
    }
  }
  doc.setTextColor(0)
}

/** "Creado con Nubih Creator · @nubih.atelier" on every page — PDFs get shared, so the brand should travel with them. */
function stampFooterOnAllPages(doc: JsPDF, pageWidth: number, pageHeight: number) {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(t.pdf.brandFooter, pageWidth / 2, pageHeight - 6, { align: 'center' })
    doc.setTextColor(0)
  }
}

/**
 * Title + spec line (technique, dimensions, bead type, physical finished
 * size, total bead count) — shared by the one-page layout (drawn once,
 * spanning the full page width above both columns) and the paginated
 * fallback's ficha page (where it's always sat, unchanged).
 */
function drawHeaderBlock(doc: JsPDF, opts: ExportPatternOptions, margin: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.text(opts.name || 'Patrón Nubih', margin, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  const size = physicalSizeMm(
    opts.technique,
    opts.cols,
    opts.rows,
    opts.beadType.widthMm,
    opts.beadType.heightMm,
    maxFringeLength(opts.fringe),
    loopBeadCount(opts.loop),
  )
  const total =
    beadCount(opts.technique, opts.cols, opts.rows, opts.rowShape) +
    totalFringeBeadCount(opts.fringe) +
    loopBeadCount(opts.loop)
  const techLabel = { loom: 'Loom', peyote: 'Peyote intercalado', brick: 'Brick stitch' }[opts.technique]
  doc.text(
    `${techLabel} · ${opts.cols} × ${opts.rows} mostacillas · ${opts.beadType.label} · ${size.widthMm.toFixed(1)} × ${size.heightMm.toFixed(1)} mm · Total: ${total} mostacillas`,
    margin,
    23,
  )
  doc.setTextColor(0)
}

/**
 * Materials legend (letra / código DB / cantidad) plus the "ficha" extras —
 * estimated thread, suggested needle, and a notes area — laid out inside an
 * arbitrary (x, y, width, height) box. Shared by the one-page layout's
 * materials column and the paginated fallback's full-width ficha page; only
 * the box they're given differs.
 */
function drawMaterialsColumn(
  doc: JsPDF,
  opts: ExportPatternOptions,
  letterForHex: Map<string, string>,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const isMetalLoop = opts.loop?.variant === 'metal'
  const palette = paletteFromCells(
    opts.cells,
    opts.loop?.variant === 'woven' ? { color: opts.loop.color, count: opts.loop.beadCount } : undefined,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text(t.pdf.materials, x, y)

  // Extras ("ficha") reserved at a fixed height at the bottom, so the materials legend above
  // always knows exactly how much room it has to squeeze into.
  const extrasHeight = 34
  const extrasY = y + height - extrasHeight

  // A metal loop adds one more legend-style row (no color swatch, no DB code — just
  // "1 argolla metálica") — folded into the same row-count sizing as the color palette
  // so it doesn't crowd or get crowded out.
  const legendRowCount = palette.length + (isMetalLoop ? 1 : 0)
  const legendTop = y + 5
  const legendAvailH = extrasY - 4 - legendTop
  const rowH = Math.max(3, Math.min(5.5, legendAvailH / Math.max(1, legendRowCount)))
  const fontSize = rowH > 4.6 ? 8 : rowH > 3.6 ? 7 : 5.5
  const boxSize = Math.min(3.6, rowH - 0.8)

  let ly = legendTop + rowH
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  for (const p of palette) {
    const match = catalogMatchForHex(p.hex)
    doc.setFillColor(p.hex)
    doc.setDrawColor(120)
    doc.rect(x, ly - boxSize, boxSize, boxSize, 'FD')
    doc.setTextColor(0)
    doc.text(
      // '~' not '≈': jsPDF's standard helvetica font only supports the WinAnsi range and
      // silently corrupts the rest of the string when fed a glyph outside it (found via
      // visual QA — the U+2248 "almost equal" sign broke every legend row that used it).
      `${letterForHex.get(p.hex) ?? '?'} — ${match.exact ? '' : '~ '}${match.color.code} (${match.color.name}) ×${p.count}`,
      x + boxSize + 3,
      ly,
    )
    ly += rowH
  }
  if (isMetalLoop) {
    doc.setDrawColor(120)
    doc.rect(x, ly - boxSize, boxSize, boxSize, 'S')
    doc.setTextColor(0)
    doc.text(t.pdf.metalLoopMaterial, x + boxSize + 3, ly)
    ly += rowH
  }

  // Ficha extras: estimated thread, suggested needle, notes space.
  doc.setDrawColor(210)
  doc.setLineWidth(0.2)
  doc.line(x, extrasY, x + width, extrasY)

  const threadM = estimateThreadMeters(
    opts.technique,
    opts.cols,
    opts.rows,
    opts.beadType.widthMm,
    totalFringeBeadCount(opts.fringe),
    opts.rowShape,
  )
  const needle = suggestedNeedle(opts.beadType)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(0)
  doc.text(`${t.pdf.threadEstimate}:`, x, extrasY + 6)
  const threadLabelWidth = doc.getTextWidth(`${t.pdf.threadEstimate}: `)
  doc.setFont('helvetica', 'normal')
  doc.text(`~ ${threadM.toFixed(1)} m`, x + threadLabelWidth, extrasY + 6)

  doc.setFont('helvetica', 'bold')
  doc.text(`${t.pdf.needle}:`, x, extrasY + 11)
  const needleLabelWidth = doc.getTextWidth(`${t.pdf.needle}: `)
  doc.setFont('helvetica', 'normal')
  doc.text(needle, x + needleLabelWidth, extrasY + 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(t.pdf.notes, x, extrasY + 17)

  const notesTop = extrasY + 19
  const note = opts.note?.trim()
  if (note) {
    // A saved note replaces the blank handwriting lines below — capped to a
    // few lines so it always fits the same fixed-height area those lines did.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60)
    const wrapped: string[] = doc.splitTextToSize(note, width)
    let noteLy = notesTop + 3
    for (const line of wrapped.slice(0, 4)) {
      doc.text(line, x, noteLy)
      noteLy += 4.2
    }
    doc.setTextColor(0)
  } else {
    doc.setDrawColor(220)
    for (let i = 1; i <= 3; i++) {
      const noteLy = notesTop + i * 4.2
      doc.line(x, noteLy, x + width, noteLy)
    }
  }
}

/**
 * Exports the current pattern to a PDF, choosing one of two layouts:
 *
 * 1. One page (preferred): title + spec line across the top, the chart in
 *    one column and the materials legend + ficha extras (thread, needle,
 *    notes) in the other, side by side — whichever A4 orientation lets the
 *    chart render at a larger cell size (see `chooseOnePageLayout`). Chosen
 *    whenever that still keeps the chart at or above `MIN_LEGIBLE_CELL_MM`
 *    in a single column, which most patterns (especially narrow-and-tall or
 *    wide-and-short ones) clear easily.
 * 2. Paginated fallback (large patterns only): a "ficha" page (title, spec
 *    line, materials, thread/needle, notes) followed by a full-page chart
 *    that shrinks only as much as needed to still fit one page (see
 *    `fitChartCellToOnePage`) — this app's original layout, kept exactly
 *    for the cases the one-page layout can't serve legibly.
 *
 * Neither layout includes the bead-by-bead word chart any more — Weave
 * Mode is the one place that sequence is actually followed live; printing
 * it out added pages without adding anything a weaver used on paper.
 * Every page gets the same footer stamp so the brand travels with shared PDFs.
 */
export async function exportPatternToPdf(opts: ExportPatternOptions): Promise<void> {
  const margin = 14
  const showLetters = opts.showLetters ?? true
  const base = chartCellMm(opts.technique)
  const bodyRows = opts.rows + maxFringeLength(opts.fringe)
  const loopRows = loopReserveUnits(opts.loop)
  // Includes the loop's own reserved height so the one-page/paginated layout
  // decision and cell-fit both leave room for it — `drawChart` itself is
  // still only ever given `bodyRows` (the loop isn't part of its grid).
  const totalRows = bodyRows + loopRows
  const onePage = chooseOnePageLayout(base, opts.cols, totalRows, margin)

  // Lazy-loaded: jsPDF is only needed the first time someone actually exports.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: onePage?.orientation ?? 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const palette = paletteFromCells(
    opts.cells,
    opts.loop?.variant === 'woven' ? { color: opts.loop.color, count: opts.loop.beadCount } : undefined,
  )
  const letterForHex = new Map(palette.map((p, i) => [p.hex, letterForIndex(i)]))

  if (onePage) {
    drawHeaderBlock(doc, opts, margin)
    const columnTop = HEADER_BOTTOM_MM
    const columnHeight = pageHeight - margin - columnTop
    const columnWidth = (pageWidth - margin * 2 - COLUMN_GUTTER_MM) / 2
    const bodyTop = columnTop + loopRows * onePage.cellH
    drawChart(doc, opts, bodyRows, letterForHex, showLetters, margin, bodyTop, onePage.cellW, onePage.cellH)
    if (opts.loop) drawLoop(doc, opts, opts.loop, letterForHex, showLetters, margin, bodyTop, onePage.cellW, onePage.cellH)
    drawMaterialsColumn(
      doc,
      opts,
      letterForHex,
      margin + columnWidth + COLUMN_GUTTER_MM,
      columnTop,
      columnWidth,
      columnHeight,
    )
  } else {
    drawHeaderBlock(doc, opts, margin)
    drawMaterialsColumn(doc, opts, letterForHex, margin, HEADER_BOTTOM_MM, pageWidth - margin * 2, pageHeight - margin - HEADER_BOTTOM_MM)

    const chartTop = margin + 8
    const availW = pageWidth - margin * 2
    const availH = pageHeight - chartTop - margin - 6
    const { w: cellW, h: cellH } = fitChartCellToOnePage(base, opts.cols, totalRows, availW, availH)
    const bodyTop = chartTop + loopRows * cellH

    doc.addPage()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text(opts.name || 'Patrón Nubih', margin, 10)
    drawChart(doc, opts, bodyRows, letterForHex, showLetters, margin, bodyTop, cellW, cellH)
    if (opts.loop) drawLoop(doc, opts, opts.loop, letterForHex, showLetters, margin, bodyTop, cellW, cellH)
  }

  stampFooterOnAllPages(doc, pageWidth, pageHeight)

  await savePdf(doc, `${(opts.name || 'patron').replace(/\s+/g, '_')}.pdf`)
}

/**
 * On the web, jsPDF's own `doc.save()` triggers a normal browser download.
 * Inside a Capacitor WebView there's no browser download UI to trigger, so
 * instead we write the PDF to the app's cache directory (the only folder
 * Capacitor shares files from without extra native config) and hand it to
 * the native share sheet — the standard Capacitor pattern for "export a
 * generated file" (Filesystem.writeFile + Filesystem.getUri + Share.share).
 */
async function savePdf(doc: JsPDF, filename: string): Promise<void> {
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) {
    doc.save(filename)
    return
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  const base64 = doc.output('datauristring').split(',')[1]
  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
  await Share.share({ title: filename, files: [uri] })
}
