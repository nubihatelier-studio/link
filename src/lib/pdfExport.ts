import type { ColorMap, FringeData, RowShape, Technique } from '@/engine/types'
import type { BeadTypeDef } from '@/engine/types'
import type { jsPDF as JsPDF } from 'jspdf'
import { cellPosition, physicalSizeMm, beadCount } from '@/engine/geometry'
import { isPaintableCell, maxFringeLength, totalFringeBeadCount } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'
import { buildWordChart } from '@/engine/wordChart'
import { weaveUnit } from '@/engine/weaveOrder'
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
  /** Free-text note — printed in the ficha page's notes area instead of blank handwriting lines when present. */
  note?: string
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
function chartCellMm(technique: Technique): { w: number; h: number } {
  if (technique === 'peyote') return { w: 3.2, h: 3.9 }
  if (technique === 'brick') return { w: 3.9, h: 3.2 }
  return { w: 3.5, h: 3.5 }
}

const MAX_LETTER_FONT_SIZE = 5.5
/** Below this cell size, a materials-list letter wouldn't be legible anyway — hidden regardless of the `showLetters` toggle. */
const MIN_LEGIBLE_CELL_MM = 2.2

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
  const { technique, cells, cols, rows, fringe } = opts
  const origin = cellPosition(technique, 0, 0, rows)

  const step = cols > 60 ? 10 : cols > 30 ? 5 : 1
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(120)
  for (let c = 0; c < cols; c++) {
    if (c % step !== 0 && c !== cols - 1) continue
    const pos = cellPosition(technique, 0, c, rows)
    doc.text(String(c + 1), originX + (pos.x - origin.x) * cellW + cellW / 2, originY - 2, { align: 'center' })
  }
  for (let r = 0; r < totalRows; r++) {
    if (r % step !== 0 && r !== totalRows - 1) continue
    const pos = cellPosition(technique, r, 0, rows)
    doc.text(String(r + 1), originX - 2, originY + (pos.y - origin.y) * cellH + cellH / 2 + 1, { align: 'right' })
  }

  const minCell = Math.min(cellW, cellH)
  const lettersVisible = showLetters && minCell >= MIN_LEGIBLE_CELL_MM
  const letterFontSize = Math.min(MAX_LETTER_FONT_SIZE, minCell * 1.6)

  doc.setLineWidth(0.05)
  for (let row = 0; row < totalRows; row++) {
    for (let col = 0; col < cols; col++) {
      // Skip a "cell" past that column's own fringe length — it doesn't exist (columns can have
      // different fringe lengths, so not every row in the fringe zone applies to every column).
      if (!isPaintableCell(row, col, cols, rows, fringe)) continue

      const hex = cells[cellKey(row, col)]
      const pos = cellPosition(technique, row, col, rows)
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

/** Cover/spec page: title, real finished size, materials legend, and the "ficha" extras (thread, needle, notes). */
function drawFichaPage(
  doc: JsPDF,
  opts: ExportPatternOptions,
  letterForHex: Map<string, string>,
  margin: number,
  pageWidth: number,
  pageHeight: number,
) {
  const palette = paletteFromCells(opts.cells)

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
  )
  const total = beadCount(opts.technique, opts.cols, opts.rows, opts.rowShape) + totalFringeBeadCount(opts.fringe)
  const techLabel = { loom: 'Loom', peyote: 'Peyote intercalado', brick: 'Brick stitch' }[opts.technique]
  doc.text(
    `${techLabel} · ${opts.cols} × ${opts.rows} mostacillas · ${opts.beadType.label} · ${size.widthMm.toFixed(1)} × ${size.heightMm.toFixed(1)} mm · Total: ${total} mostacillas`,
    margin,
    23,
  )
  doc.setTextColor(0)

  // Extras ("ficha") reserved at a fixed height at the bottom, so the materials legend above
  // always knows exactly how much room it has to squeeze into.
  const extrasHeight = 34
  const extrasY = pageHeight - margin - extrasHeight

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(t.pdf.materials, margin, 32)

  const legendTop = 37
  const legendAvailH = extrasY - 4 - legendTop
  const rowH = Math.max(3, Math.min(5.5, legendAvailH / Math.max(1, palette.length)))
  const fontSize = rowH > 4.6 ? 8 : rowH > 3.6 ? 7 : 5.5
  const boxSize = Math.min(3.6, rowH - 0.8)

  let y = legendTop + rowH
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  for (const p of palette) {
    const match = catalogMatchForHex(p.hex)
    doc.setFillColor(p.hex)
    doc.setDrawColor(120)
    doc.rect(margin, y - boxSize, boxSize, boxSize, 'FD')
    doc.setTextColor(0)
    doc.text(
      // '~' not '≈': jsPDF's standard helvetica font only supports the WinAnsi range and
      // silently corrupts the rest of the string when fed a glyph outside it (found via
      // visual QA — the U+2248 "almost equal" sign broke every legend row that used it).
      `${letterForHex.get(p.hex) ?? '?'} — ${match.exact ? '' : '~ '}${match.color.code} (${match.color.name}) ×${p.count}`,
      margin + boxSize + 3,
      y,
    )
    y += rowH
  }

  // Ficha extras: estimated thread, suggested needle, notes space.
  doc.setDrawColor(210)
  doc.setLineWidth(0.2)
  doc.line(margin, extrasY, pageWidth - margin, extrasY)

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
  doc.text(`${t.pdf.threadEstimate}:`, margin, extrasY + 6)
  const threadLabelWidth = doc.getTextWidth(`${t.pdf.threadEstimate}: `)
  doc.setFont('helvetica', 'normal')
  doc.text(`~ ${threadM.toFixed(1)} m`, margin + threadLabelWidth, extrasY + 6)

  doc.setFont('helvetica', 'bold')
  doc.text(`${t.pdf.needle}:`, margin, extrasY + 11)
  const needleLabelWidth = doc.getTextWidth(`${t.pdf.needle}: `)
  doc.setFont('helvetica', 'normal')
  doc.text(needle, margin + needleLabelWidth, extrasY + 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(t.pdf.notes, margin, extrasY + 17)

  const notesTop = extrasY + 19
  const note = opts.note?.trim()
  if (note) {
    // A saved note replaces the blank handwriting lines below — capped to a
    // few lines so it always fits the same fixed-height area those lines did.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60)
    const wrapped: string[] = doc.splitTextToSize(note, pageWidth - margin * 2)
    let ly = notesTop + 3
    for (const line of wrapped.slice(0, 4)) {
      doc.text(line, margin, ly)
      ly += 4.2
    }
    doc.setTextColor(0)
  } else {
    doc.setDrawColor(220)
    for (let i = 1; i <= 3; i++) {
      const ly = notesTop + i * 4.2
      doc.line(margin, ly, pageWidth - margin, ly)
    }
  }
}

/**
 * Word-chart pages: the same bead-by-bead sequence as Weave Mode, as compact
 * run-length-encoded text. Long lines wrap (a wide pattern easily exceeds one
 * page's width) with continuation lines indented under the sequence — not
 * repeating "Columna N:" — using plain spaces, safe because Courier is
 * monospace so the indent lines up exactly with the prefix it replaces.
 */
function drawWordChartPages(
  doc: JsPDF,
  opts: ExportPatternOptions,
  letterForHex: Map<string, string>,
  margin: number,
  pageWidth: number,
  pageHeight: number,
) {
  const lines = buildWordChart(
    opts.technique,
    opts.cols,
    opts.rows,
    opts.cells,
    (hex) => letterForHex.get(hex) ?? '?',
    opts.fringe,
    opts.rowShape,
  )
  const unitLabel = weaveUnit(opts.technique) === 'column' ? 'Columna' : 'Fila'
  const lineHeight = 4.6
  const footerReserve = 10
  const headerHeight = 16
  const maxWidth = pageWidth - margin * 2

  function drawPageHeader(): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text(t.pdf.wordChartTitle, margin, margin + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(130)
    doc.text(opts.name || 'Patrón Nubih', margin, margin + 9)
    doc.setTextColor(0)
    doc.setFont('courier', 'normal')
    doc.setFontSize(8)
    return margin + headerHeight
  }

  doc.addPage()
  let y = drawPageHeader()

  for (const line of lines) {
    const prefix = line.isFringe ? `${t.pdf.fringeLabel} ${line.unitIndex + 1}: ` : `${unitLabel} ${line.unitIndex + 1}: `
    const indent = ' '.repeat(prefix.length)
    const wrapped: string[] = doc.splitTextToSize(line.text, maxWidth - doc.getTextWidth(prefix))

    wrapped.forEach((piece, i) => {
      if (y > pageHeight - margin - footerReserve) {
        doc.addPage()
        y = drawPageHeader()
      }
      doc.text((i === 0 ? prefix : indent) + piece, margin, y)
      y += lineHeight
    })
  }
}

/**
 * Exports the current pattern to a multi-page PDF:
 * 1. A "ficha" page — title, real finished size, materials legend (letra /
 *    código / cantidad), estimated thread length, suggested needle and a
 *    notes area.
 * 2. One chart page — vector-drawn, with the materials-list letter inside
 *    each bead for B/W-print legibility. The whole cols × totalRows grid
 *    (body + fringe) always fits this single page: it renders at the
 *    legible `chartCellMm` size when that already fits, and shrinks only as
 *    much as needed otherwise (see `fitChartCellToOnePage`).
 * 3. One or more word-chart pages — the same traversal Weave Mode uses,
 *    written out as compact per-row/column text.
 * Every page gets the same footer stamp so the brand travels with shared PDFs.
 */
export async function exportPatternToPdf(opts: ExportPatternOptions): Promise<void> {
  // Lazy-loaded: jsPDF is only needed the first time someone actually exports.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const showLetters = opts.showLetters ?? true

  const palette = paletteFromCells(opts.cells)
  const letterForHex = new Map(palette.map((p, i) => [p.hex, letterForIndex(i)]))

  drawFichaPage(doc, opts, letterForHex, margin, pageWidth, pageHeight)

  const base = chartCellMm(opts.technique)
  const chartTop = margin + 8
  const availW = pageWidth - margin * 2
  const availH = pageHeight - chartTop - margin - 6
  const totalRows = opts.rows + maxFringeLength(opts.fringe)
  const { w: cellW, h: cellH } = fitChartCellToOnePage(base, opts.cols, totalRows, availW, availH)

  doc.addPage()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0)
  doc.text(opts.name || 'Patrón Nubih', margin, 10)
  drawChart(doc, opts, totalRows, letterForHex, showLetters, margin, chartTop, cellW, cellH)

  drawWordChartPages(doc, opts, letterForHex, margin, pageWidth, pageHeight)

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
