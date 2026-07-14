import type { ColorMap, Technique } from '@/engine/types'
import type { BeadTypeDef } from '@/engine/types'
import type { jsPDF as JsPDF } from 'jspdf'
import { cellPosition, gridBoundsUnits, physicalSizeMm, beadCount } from '@/engine/geometry'
import { cellKey } from '@/engine/cellKey'
import { planChartSections, type ChartSection } from '@/engine/chartPagination'
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
  /** Draw the materials-list letter (A/B/C…) inside each bead, colored for contrast. Default true — without it the chart is unreadable in B/W print or with similar-looking colors. */
  showLetters?: boolean
}

/**
 * Chart cell size in mm, tuned per technique for on-paper legibility —
 * intentionally NOT the bead's real physical size (a Delica 11/0 is
 * ~1.6mm, which would be unreadable at 1:1). Proportions ported from the
 * Lovable build's `baseBeadPx` (peyote tall, brick wide, loom square); the
 * bead's *actual* physical size is still shown separately in the spec line
 * via `physicalSizeMm`, so the finished-piece dimensions stay accurate even
 * though the printed chart is enlarged.
 *
 * This is also the legibility floor: the chart is always rendered at this
 * size and never shrunk to squeeze a big grid onto one page (that's what
 * made letters/numbers unreadable before). When a grid doesn't fit a page
 * at this size, `exportPatternToPdf` splits it into section pages instead
 * (see engine/chartPagination.ts) rather than scaling down further.
 */
function chartCellMm(technique: Technique): { w: number; h: number } {
  if (technique === 'peyote') return { w: 3.2, h: 3.9 }
  if (technique === 'brick') return { w: 3.9, h: 3.2 }
  return { w: 3.5, h: 3.5 }
}

const LETTER_FONT_SIZE = 5.5

/**
 * Draws one chart section (a colStart..colEnd / rowStart..rowEnd
 * sub-rectangle of the full grid — the whole grid when it fits on one
 * page) as PDF vector primitives, with the materials-list letter inside
 * every colored cell so the chart stays legible printed in black & white
 * or with visually similar colors.
 *
 * Row/col numbers reflect the *real* grid position (not section-local), so
 * sections can be taped together and read against Weave Mode without
 * re-numbering anything.
 */
function drawChartSection(
  doc: JsPDF,
  opts: ExportPatternOptions,
  section: ChartSection,
  letterForHex: Map<string, string>,
  showLetters: boolean,
  originX: number,
  originY: number,
  cellW: number,
  cellH: number,
): void {
  const { technique, cells, cols } = opts
  const { colStart, colEnd, rowStart, rowEnd } = section
  // Every cell's position is expressed in absolute bead units (parity-dependent offsets use the
  // real col/row index), so subtracting the section's own origin flushes it to (originX, originY)
  // while preserving the true zigzag/stagger geometry within the section.
  const origin = cellPosition(technique, rowStart, colStart)

  const step = cols > 60 ? 10 : cols > 30 ? 5 : 1
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(120)
  for (let c = colStart; c < colEnd; c++) {
    if (c % step !== 0 && c !== colStart && c !== colEnd - 1) continue
    const pos = cellPosition(technique, rowStart, c)
    doc.text(String(c + 1), originX + (pos.x - origin.x) * cellW + cellW / 2, originY - 2, { align: 'center' })
  }
  for (let r = rowStart; r < rowEnd; r++) {
    if (r % step !== 0 && r !== rowStart && r !== rowEnd - 1) continue
    const pos = cellPosition(technique, r, colStart)
    doc.text(String(r + 1), originX - 2, originY + (pos.y - origin.y) * cellH + cellH / 2 + 1, { align: 'right' })
  }

  doc.setLineWidth(0.05)
  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = colStart; col < colEnd; col++) {
      const hex = cells[cellKey(row, col)]
      const pos = cellPosition(technique, row, col)
      const x = originX + (pos.x - origin.x) * cellW
      const y = originY + (pos.y - origin.y) * cellH

      if (hex) {
        doc.setFillColor(hex)
        doc.setDrawColor(200)
        doc.rect(x, y, cellW, cellH, 'FD')
        if (showLetters) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(LETTER_FONT_SIZE)
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
 * Small "you are here" diagram drawn on multi-section chart pages: the full
 * grid's outline with the current section's sub-rectangle highlighted. Uses
 * plain col/row proportions rather than exact technique geometry — accurate
 * enough for orientation at this scale, and simpler than re-deriving
 * bead-unit bounds for an arbitrary sub-rectangle.
 */
function drawMinimap(doc: JsPDF, opts: ExportPatternOptions, section: ChartSection, x: number, y: number, w: number, h: number) {
  const bounds = gridBoundsUnits(opts.technique, opts.cols, opts.rows)
  const scale = Math.min(w / bounds.width, h / bounds.height)
  const mapW = bounds.width * scale
  const mapH = bounds.height * scale

  doc.setDrawColor(180)
  doc.setLineWidth(0.2)
  doc.rect(x, y, mapW, mapH)

  const secX = x + (section.colStart / opts.cols) * mapW
  const secW = Math.max(0.6, ((section.colEnd - section.colStart) / opts.cols) * mapW)
  const secY = y + (section.rowStart / opts.rows) * mapH
  const secH = Math.max(0.6, ((section.rowEnd - section.rowStart) / opts.rows) * mapH)

  doc.setFillColor('#c9a227')
  doc.setDrawColor(0)
  doc.rect(secX, secY, secW, secH, 'FD')
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
  const size = physicalSizeMm(opts.technique, opts.cols, opts.rows, opts.beadType.widthMm, opts.beadType.heightMm)
  const total = beadCount(opts.technique, opts.cols, opts.rows)
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

  const threadM = estimateThreadMeters(opts.technique, opts.cols, opts.rows, opts.beadType.widthMm)
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
  doc.setDrawColor(220)
  const notesTop = extrasY + 19
  for (let i = 1; i <= 3; i++) {
    const ly = notesTop + i * 4.2
    doc.line(margin, ly, pageWidth - margin, ly)
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
  const lines = buildWordChart(opts.technique, opts.cols, opts.rows, opts.cells, (hex) => letterForHex.get(hex) ?? '?')
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
    const prefix = `${unitLabel} ${line.unitIndex + 1}: `
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
 * 2. One or more chart pages — vector-drawn, with the materials-list letter
 *    inside each bead for B/W-print legibility, split into overlapping
 *    sections when the grid doesn't fit one page at a legible bead size
 *    (see chartCellMm).
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
  const colsPerPage = Math.max(1, Math.floor(availW / base.w))
  const rowsPerPage = Math.max(1, Math.floor(availH / base.h))
  const sections = planChartSections(opts.cols, opts.rows, colsPerPage, rowsPerPage)
  const multipage = sections.length > 1

  for (const [i, section] of sections.entries()) {
    doc.addPage()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text(opts.name || 'Patrón Nubih', margin, 10)
    if (multipage) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(
        `${t.pdf.section(i + 1, sections.length)} · ${t.pdf.columnsRange(section.colStart + 1, section.colEnd)} · ${t.pdf.rowsRange(section.rowStart + 1, section.rowEnd)}`,
        margin,
        15,
      )
      doc.setTextColor(0)
      drawMinimap(doc, opts, section, pageWidth - margin - 26, 4, 26, 18)
    }

    drawChartSection(doc, opts, section, letterForHex, showLetters, margin, chartTop, base.w, base.h)
  }

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
