import type { ColorMap, FringeData, LoopData, PairData, RowShape, Technique } from '@/engine/types'
import { loadPng, WORDMARK_SRC, type PngFile } from './loadImage'
import type { BeadTypeDef } from '@/engine/types'
import type { jsPDF as JsPDF } from 'jspdf'
import { cellPosition, physicalSizeMm, beadCount, gridBoundsUnits, loopAnchorX, rowPitch, type StaggerPhase } from '@/engine/geometry'
import { isPaintableCell, maxFringeLength, totalFringeBeadCount } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { loopBeadCount, loopBeadOffsets, loopReserveUnits, METAL_LOOP_INDICATOR_UNITS } from '@/engine/loop'
import { assignLettersAcross, type LetterAssignment, type LetterEntry } from '@/engine/letters'
import { piecesOf, type Piece } from '@/engine/pair'
import { beadMetrics, contrastTextColor } from './beadStyle'
import { describeColor } from './colorName'
import { formatSizeMm } from '@/engine/units'
import { shareOrDownloadFile } from './shareFile'
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
  staggerPhase?: StaggerPhase
  /**
   * The letters the pattern remembers (`PatternDoc.letters`), so paper and
   * screen agree even after colours have been added or erased. Absent falls
   * back to numbering by order of first use.
   */
  letterAssignment?: LetterAssignment
  /** Free-text note — printed in the ficha page's notes area instead of blank handwriting lines when present. */
  note?: string
  /** Hanging loop at the top tip — see `engine/types.ts#LoopData`. Absent = no loop. */
  loop?: LoopData
  /** Draw the materials-list letter (A/B/C…) inside each bead, colored for contrast. Default true — without it the chart is unreadable in B/W print or with similar-looking colors. */
  showLetters?: boolean
  /** Which sections to print — see `PdfSections`. Omitted means all of them. */
  sections?: Partial<PdfSections>
  /**
   * The earring pair these options are the left earring of, if any — see
   * `engine/pair.ts`. The chart then prints both earrings side by side, and
   * the materials and thread cover the pair.
   */
  pair?: PairData
}

/**
 * The three things a pattern PDF can contain. The bead-by-bead written
 * sequence used to be a fourth: it produced several extra pages nobody was
 * printing, and it belongs in Weave Mode, where you read it one pass at a
 * time off the screen. `engine/wordChart.ts` still builds it — for that
 * screen, not for this document.
 */
export interface PdfSections {
  chart: boolean
  materials: boolean
  notes: boolean
}

export const ALL_PDF_SECTIONS: PdfSections = { chart: true, materials: true, notes: true }

/** Fills in anything a caller left unsaid — a caller passing `{ chart: false }` is narrowing a complete document. */
function resolveSections(sections: Partial<PdfSections> | undefined): PdfSections {
  return { ...ALL_PDF_SECTIONS, ...sections }
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
/** Height of the brand wordmark printed at the top right of the first page. */
const LOGO_HEIGHT_MM = 9

/** `text`, cut with an ellipsis if it doesn't fit `maxWidth` at the current font. */
function fitText(doc: JsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Y position where content below the title + spec line starts — matches the fixed positions `drawHeaderBlock` draws at (16, 23), same convention the ficha page always used. */
const HEADER_BOTTOM_MM = 30
const FOOTER_RESERVE_MM = 10
/** Space between the two charts of an earring pair, in cells. */
const PAIR_GAP_CELLS = 2
/** Room above a pair's charts for the "Aro izquierdo" / "Aro derecho" labels. */
const PAIR_LABEL_MM = 6

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
    // El fleco cuenta aparte, desde 1, como en el editor y en el modo tejido:
    // sus filas no son filas del cuerpo, y seguir la cuenta del cuerpo
    // (…6, 7, 8) hacía leer el fleco como si el cuerpo continuara.
    const label = r >= rows ? r - rows + 1 : r + 1
    // baseline: 'middle' derives the vertical centering from the font's own metrics — a fixed
    // mm offset (the previous approach) doesn't scale with cell size and visibly drifts off the
    // row at small cell sizes (a 1mm constant is half a bead at a ~2mm cell).
    doc.text(String(label), originX - 2, originY + (pos.y - origin.y) * cellH + cellH / 2, {
      align: 'right',
      baseline: 'middle',
    })
  }

  const minCell = Math.min(cellW, cellH)
  const lettersVisible = showLetters && minCell >= MIN_LEGIBLE_CELL_MM
  const letterFontSize = Math.min(MAX_LETTER_FONT_SIZE, minCell * 1.6)

  // Same bead style as the editor canvas (see lib/beadStyle.ts): a gap on both
  // axes and rounded corners, so a column reads as a stack of beads rather
  // than one bar of colour. The height fed to `beadMetrics` is the real
  // distance to the next row, not the nominal cell — peyote and brick step
  // less than a full cell (see geometry.ts#rowPitch), so a bead sized to the
  // cell would overlap the one below and close the gap again.
  const rowStep = rowPitch(technique) * cellH
  const bead = beadMetrics(cellW, rowStep)

  doc.setLineWidth(0.05)
  for (let row = 0; row < totalRows; row++) {
    for (let col = 0; col < cols; col++) {
      // Skip a "cell" past that column's own fringe length, or outside a shaped row's own span —
      // it doesn't exist (columns can have different fringe lengths, and a shaped body's rows can
      // be narrower than `cols`, so not every (row, col) in this rectangle is a real bead).
      if (!isPaintableCell(row, col, cols, rows, fringe, rowShape)) continue

      const hex = cells[cellKey(row, col)]
      const pos = cellPosition(technique, row, col, rows, staggerPhase)
      const x = originX + (pos.x - origin.x) * cellW + bead.inset
      const y = originY + (pos.y - origin.y) * cellH + bead.inset

      doc.setDrawColor(200)
      if (hex) {
        doc.setFillColor(hex)
        doc.roundedRect(x, y, bead.width, bead.height, bead.radius, bead.radius, 'FD')
        if (lettersVisible) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(letterFontSize)
          doc.setTextColor(contrastTextColor(hex))
          doc.text(letterForHex.get(hex) ?? '?', x + bead.width / 2, y + bead.height / 2, {
            align: 'center',
            baseline: 'middle',
          })
        }
      } else {
        // An empty bead still gets its outline: that's the background mesh the
        // editor shows, and what makes an unpainted stretch readable as beads.
        doc.roundedRect(x, y, bead.width, bead.height, bead.radius, bead.radius, 'S')
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
function drawHeaderBlock(doc: JsPDF, opts: ExportPatternOptions, margin: number, logo?: PngFile) {
  const pageWidth = doc.internal.pageSize.getWidth()
  // The wordmark sits top right, and the pattern's name gets whatever width is
  // left — a long name is cut with an ellipsis rather than running under it.
  let nameWidth = pageWidth - margin * 2
  if (logo) {
    const height = LOGO_HEIGHT_MM
    const width = (logo.width / logo.height) * height
    doc.addImage(logo.dataUrl, 'PNG', pageWidth - margin - width, 9, width, height)
    nameWidth -= width + 6
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.text(fitText(doc, opts.name || 'Patrón Nubih', nameWidth), margin, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  const size = physicalSizeMm(
    opts.technique,
    opts.cols,
    opts.rows,
    opts.beadType,
    maxFringeLength(opts.fringe),
    loopBeadCount(opts.loop),
  )
  const total =
    beadCount(opts.technique, opts.cols, opts.rows, opts.rowShape) +
    totalFringeBeadCount(opts.fringe) +
    loopBeadCount(opts.loop)
  const techLabel = { loom: 'Loom', peyote: 'Peyote intercalado', brick: 'Brick stitch', triangle: 'Aro triangular' }[
    opts.technique
  ]
  // A pair is two earrings of the same size: the size is per earring, the total is the pair's.
  const sizeLabel = `${formatSizeMm(size.widthMm, size.heightMm)}${opts.pair ? ` ${t.pdf.eachEarring}` : ''}`
  const totalLabel = opts.pair ? t.pdf.pairTotal(total * 2) : `Total: ${total} mostacillas`
  doc.text(
    `${techLabel} · ${opts.cols} × ${opts.rows} mostacillas · ${opts.beadType.label} · ${sizeLabel} · ${totalLabel}`,
    margin,
    23,
  )
  doc.setTextColor(0)
}

/**
 * Materials legend (letra / nombre del color / cantidad) plus the "ficha" extras —
 * estimated thread, suggested needle, and a notes area — laid out inside an
 * arbitrary (x, y, width, height) box. Shared by the one-page layout's
 * materials column and the paginated fallback's full-width ficha page; only
 * the box they're given differs.
 */
function drawMaterialsColumn(
  doc: JsPDF,
  opts: ExportPatternOptions,
  palette: LetterEntry[],
  x: number,
  y: number,
  width: number,
  height: number,
  sections: PdfSections,
) {
  const isMetalLoop = opts.loop?.variant === 'metal'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text(t.pdf.materials, x, y)

  // Extras ("ficha") reserved at a fixed height at the bottom, so the materials legend above
  // always knows exactly how much room it has to squeeze into.
  const extrasHeight = 34
  const extrasY = y + height - extrasHeight

  // A metal loop adds one more legend-style row (no color swatch, no color name — just
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
    doc.setFillColor(p.hex)
    doc.setDrawColor(120)
    doc.rect(x, ly - boxSize, boxSize, boxSize, 'FD')
    doc.setTextColor(0)
    doc.text(
      // A plain color name, no bead-brand code: the color was chosen freely and the
      // weaver buys the closest bead in whatever brand she likes. jsPDF's standard
      // helvetica only covers WinAnsi — `describeColor` stays inside it.
      `${p.letter} — ${describeColor(p.hex)} ×${p.count}`,
      x + boxSize + 3,
      ly,
    )
    ly += rowH
  }
  if (isMetalLoop) {
    doc.setDrawColor(120)
    doc.rect(x, ly - boxSize, boxSize, boxSize, 'S')
    doc.setTextColor(0)
    doc.text(opts.pair ? t.pdf.metalLoopMaterialPair : t.pdf.metalLoopMaterial, x + boxSize + 3, ly)
    ly += rowH
  }

  // Ficha extras: estimated thread, suggested needle, notes space.
  doc.setDrawColor(210)
  doc.setLineWidth(0.2)
  doc.line(x, extrasY, x + width, extrasY)

  const threadM =
    estimateThreadMeters(
      opts.technique,
      opts.cols,
      opts.rows,
      opts.beadType.widthMm,
      totalFringeBeadCount(opts.fringe),
      opts.rowShape,
    ) * (opts.pair ? 2 : 1)
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

  if (!sections.notes) return

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
 * Every page gets the same footer stamp so the brand travels with shared PDFs.
 */
export async function exportPatternToPdf(opts: ExportPatternOptions): Promise<void> {
  const margin = 14
  const sections = resolveSections(opts.sections)
  const showLetters = opts.showLetters ?? true
  const base = chartCellMm(opts.technique)
  const bodyRows = opts.rows + maxFringeLength(opts.fringe)
  const loopRows = loopReserveUnits(opts.loop)

  // An earring pair prints both earrings side by side, each under its own
  // label; a single piece prints as it always has.
  const left: Piece = {
    technique: opts.technique,
    cols: opts.cols,
    rows: opts.rows,
    cells: opts.cells,
    fringe: opts.fringe,
    rowShape: opts.rowShape,
    staggerPhase: opts.staggerPhase ?? 0,
    loop: opts.loop,
  }
  const pieces = piecesOf(left, opts.pair)
  const isPair = pieces.length > 1
  const pieceWidthUnits = gridBoundsUnits(opts.technique, opts.cols, opts.rows, maxFringeLength(opts.fringe)).width
  // Width the layout has to fit, in cells: one chart, or two plus the gap between them.
  const chartCols = isPair ? pieceWidthUnits * 2 + PAIR_GAP_CELLS : opts.cols
  // The labels above a pair's charts need room too — expressed in rows, like
  // the loop's reserve, so the layout decision and the cell fit account for it.
  const labelRows = isPair ? PAIR_LABEL_MM / base.h : 0
  // Includes the loop's own reserved height so the one-page/paginated layout
  // decision and cell-fit both leave room for it — `drawChart` itself is
  // still only ever given `bodyRows` (the loop isn't part of its grid).
  const totalRows = bodyRows + loopRows + labelRows
  // With no chart there's nothing to fit, so the side-by-side layout is moot:
  // the materials go full width on the first page.
  const onePage = sections.chart ? chooseOnePageLayout(base, chartCols, totalRows, margin) : null

  /** Draws every piece's chart (and loop) left to right from `originX`, the body starting at `bodyTop`. */
  function drawPieces(originX: number, bodyTop: number, cellW: number, cellH: number) {
    pieces.forEach((piece, i) => {
      const x = originX + i * (pieceWidthUnits + PAIR_GAP_CELLS) * cellW
      const pieceOpts: ExportPatternOptions = { ...opts, ...piece }
      if (isPair) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(60)
        doc.text(i === 0 ? t.pdf.leftEarring : t.pdf.rightEarring, x, bodyTop - loopRows * cellH - 6)
      }
      drawChart(doc, pieceOpts, bodyRows, letterForHex, showLetters, x, bodyTop, cellW, cellH)
      if (piece.loop) drawLoop(doc, pieceOpts, piece.loop, letterForHex, showLetters, x, bodyTop, cellW, cellH)
    })
    doc.setTextColor(0)
  }

  // Lazy-loaded: jsPDF is only needed the first time someone actually exports.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: onePage?.orientation ?? 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // One assignment for the whole document — every chart and the materials
  // legend label a color the same way, and the same way the editor does (see
  // `engine/letters.ts`). For a pair it spans both earrings, and the counts
  // are the pair's.
  const palette = assignLettersAcross(pieces, opts.letterAssignment)
  const letterForHex = new Map(palette.map((p) => [p.hex, p.letter]))

  // The logo is a nice-to-have: if it can't be loaded (offline, blocked), the
  // header prints exactly as it always did.
  const logo = await loadPng(WORDMARK_SRC.light).catch(() => undefined)
  drawHeaderBlock(doc, opts, margin, logo)

  if (onePage) {
    const columnTop = HEADER_BOTTOM_MM
    const columnHeight = pageHeight - margin - columnTop
    // Materials off means the chart gets the whole sheet instead of half of it.
    const columnWidth = sections.materials ? (pageWidth - margin * 2 - COLUMN_GUTTER_MM) / 2 : pageWidth - margin * 2
    const bodyTop = columnTop + (loopRows + labelRows) * onePage.cellH
    drawPieces(margin, bodyTop, onePage.cellW, onePage.cellH)
    if (sections.materials) {
      drawMaterialsColumn(
        doc,
        opts,
        palette,
        margin + columnWidth + COLUMN_GUTTER_MM,
        columnTop,
        columnWidth,
        columnHeight,
        sections,
      )
    }
  } else {
    if (sections.materials) {
      drawMaterialsColumn(
        doc,
        opts,
        palette,
        margin,
        HEADER_BOTTOM_MM,
        pageWidth - margin * 2,
        pageHeight - margin - HEADER_BOTTOM_MM,
        sections,
      )
    }

    if (sections.chart) {
      const chartTop = margin + 8
      const availW = pageWidth - margin * 2
      const availH = pageHeight - chartTop - margin - 6
      const { w: cellW, h: cellH } = fitChartCellToOnePage(base, chartCols, totalRows, availW, availH)
      const bodyTop = chartTop + (loopRows + labelRows) * cellH

      doc.addPage()
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(0)
      doc.text(opts.name || 'Patrón Nubih', margin, 10)
      drawPieces(margin, bodyTop, cellW, cellH)
    }
  }

  stampFooterOnAllPages(doc, pageWidth, pageHeight)

  await savePdf(doc, `${(opts.name || 'patron').replace(/\s+/g, '_')}.pdf`)
}

/**
 * Hands the finished document to the weaver — see `shareFile.ts` for why this
 * deliberately does NOT use jsPDF's own `doc.save()`. That helper is an
 * `<a download>` click, which is a silent no-op in an installed PWA and in
 * iOS Safari: the PDF was being built correctly and then vanishing, with no
 * error anywhere, which is exactly what "Exportar PDF no funciona" looked
 * like from the outside.
 */
async function savePdf(doc: JsPDF, filename: string): Promise<void> {
  await shareOrDownloadFile(doc.output('blob'), filename)
}
